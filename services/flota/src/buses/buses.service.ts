import {
  type Bus,
  type BusFields,
  type BusListQuery,
  type BusPage,
  pageArgs,
  toPage,
} from '@debus/contracts';
import { isConstraintViolation, isUniqueViolation } from '@debus/server';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { assertBranchActive } from '../common/branch-guard';
import { FleetEvents } from '../common/fleet-events';
import { FLEET_MESSAGES } from '../common/messages';
import type { Prisma } from '../generated/prisma/client';
import { readSavedPhoto, replacePhoto } from '../photos/photo-files';
import { PHOTO_STORAGE, type PhotoStorage, type StoredPhoto } from '../photos/photo-storage';
import type { NewPhoto } from '../photos/photo-upload';
import { PrismaService } from '../prisma/prisma.service';
import { BUS_INCLUDE, toBus, toBusPayload } from './bus-mappers';
import { busSearchWhere } from './bus-scope';
import {
  canAssignDriver,
  displayStatusWhere,
  hasPendingTrips,
  mileageProblem,
  toStatusCounts,
} from './bus-rules';

// The id breaks ties, so a bus never shows up on two pages or on none.
const BY_PLATE: Prisma.BusOrderByWithRelationInput[] = [{ plate: 'asc' }, { id: 'asc' }];

@Injectable()
export class BusesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: FleetEvents,
    @Inject(PHOTO_STORAGE) private readonly photos: PhotoStorage,
  ) {}

  async list(branchId: string, query: BusListQuery): Promise<BusPage> {
    const scope = { branchId, ...busSearchWhere(query.q) };
    const where =
      query.status === 'all' ? scope : { ...scope, ...displayStatusWhere(query.status) };
    const [rows, total, groups] = await this.prisma.$transaction([
      this.prisma.bus.findMany({
        where,
        include: BUS_INCLUDE,
        orderBy: BY_PLATE,
        ...pageArgs(query),
      }),
      this.prisma.bus.count({ where }),
      // The numbers on the tabs ignore the selected tab, so switching tabs keeps them still.
      this.prisma.bus.groupBy({
        by: ['active', 'inTransit', 'operationalStatus'],
        where: scope,
        orderBy: { active: 'asc' },
        _count: { _all: true },
      }),
    ]);
    return {
      ...toPage(rows.map(toBus), total, query),
      summary: { statusCounts: toStatusCounts(groups) },
    };
  }

  async get(branchId: string, id: string): Promise<Bus> {
    return toBus(await this.found(this.prisma, branchId, id));
  }

  async create(branchId: string, fields: BusFields, correlationId?: string): Promise<Bus> {
    const row = await this.translateConflicts(() =>
      this.prisma.$transaction(async (tx) => {
        await assertBranchActive(tx, branchId);
        await this.assertAssignable(tx, branchId, fields.assignedDriverId);
        const bus = await tx.bus.create({ data: { ...fields, branchId }, include: BUS_INCLUDE });
        await this.events.bus(tx, 'BusAdded', toBusPayload(bus), correlationId);
        return bus;
      }),
    );
    await this.events.flush();
    return toBus(row);
  }

  async update(
    branchId: string,
    id: string,
    fields: BusFields,
    correlationId?: string,
  ): Promise<Bus> {
    const row = await this.translateConflicts(() =>
      this.prisma.$transaction(async (tx) => {
        // Locks the bus so a trip that completes meanwhile cannot have its mileage overwritten.
        await tx.$queryRaw`SELECT id FROM buses WHERE id = ${id}::uuid FOR UPDATE`;
        const current = await this.found(tx, branchId, id);
        if (mileageProblem(current.mileageKm, fields.mileageKm)) {
          throw new ConflictException(FLEET_MESSAGES.mileageDecrease);
        }
        await this.assertAssignable(tx, branchId, fields.assignedDriverId, id);
        const bus = await tx.bus.update({
          where: { id },
          data: { ...fields, version: { increment: 1 } },
          include: BUS_INCLUDE,
        });
        await this.events.bus(tx, 'BusUpdated', toBusPayload(bus), correlationId);
        return bus;
      }),
    );
    await this.events.flush();
    return toBus(row);
  }

  async setActive(
    branchId: string,
    id: string,
    active: boolean,
    correlationId?: string,
  ): Promise<void> {
    const changed = await this.prisma.$transaction(async (tx) => {
      // Locks the bus so a TripScheduled handled meanwhile waits and sees the final state.
      await tx.$queryRaw`SELECT id FROM buses WHERE id = ${id}::uuid FOR UPDATE`;
      const bus = await this.found(tx, branchId, id);
      if (bus.active === active) return false;
      if (!active) {
        const trips = await tx.tripCopy.findMany({
          where: { busId: id },
          select: { status: true },
        });
        if (hasPendingTrips(trips)) throw new ConflictException(FLEET_MESSAGES.busHasTrips);
      }
      const updated = await tx.bus.update({
        where: { id },
        // A deactivated bus lets its driver go, so the driver can be assigned elsewhere.
        data: { active, version: { increment: 1 }, ...(active ? {} : { assignedDriverId: null }) },
      });
      await this.events.bus(
        tx,
        active ? 'BusUpdated' : 'BusDeactivated',
        toBusPayload(updated),
        correlationId,
      );
      return true;
    });
    if (changed) await this.events.flush();
  }

  async savePhoto(branchId: string, id: string, photo: NewPhoto): Promise<void> {
    const bus = await this.found(this.prisma, branchId, id);
    await replacePhoto(this.photos, {
      kind: 'buses',
      id,
      previousKey: bus.photoKey,
      photo,
      point: (photoKey) => this.prisma.bus.update({ where: { id }, data: { photoKey } }),
    });
  }

  async readPhoto(branchId: string, id: string): Promise<StoredPhoto> {
    const bus = await this.found(this.prisma, branchId, id);
    return readSavedPhoto(this.photos, bus.photoKey);
  }

  private async found(db: Prisma.TransactionClient, branchId: string, id: string) {
    const bus = await db.bus.findFirst({ where: { id, branchId }, include: BUS_INCLUDE });
    if (!bus) throw new NotFoundException(FLEET_MESSAGES.busNotFound);
    return bus;
  }

  private async assertAssignable(
    tx: Prisma.TransactionClient,
    branchId: string,
    driverId: string | null,
    busId?: string,
  ): Promise<void> {
    if (!driverId) return;
    const driver = await tx.driver.findUnique({
      where: { id: driverId },
      include: { assignedBus: { select: { id: true } } },
    });
    if (!driver || !canAssignDriver({ branchId }, driver)) {
      throw new ConflictException(FLEET_MESSAGES.driverUnavailable);
    }
    if (driver.assignedBus && driver.assignedBus.id !== busId) {
      throw new ConflictException(FLEET_MESSAGES.driverAlreadyAssigned);
    }
  }

  private async translateConflicts<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      throw new ConflictException(
        isConstraintViolation(error, 'assigned_driver')
          ? FLEET_MESSAGES.driverAlreadyAssigned
          : FLEET_MESSAGES.plateTaken,
      );
    }
  }
}
