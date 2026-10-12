import {
  type Driver,
  type DriverFields,
  type DriverListQuery,
  type DriverPage,
  pageArgs,
  toPage,
  todayInGuatemala,
} from '@debus/contracts';
import { isConstraintViolation, isUniqueViolation } from '@debus/server';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { toBusPayload } from '../buses/bus-mappers';
import { hasPendingTrips } from '../buses/bus-rules';
import { toActiveCounts } from '../common/active-counts';
import { assertBranchActive } from '../common/branch-guard';
import { FleetEvents } from '../common/fleet-events';
import { FLEET_MESSAGES } from '../common/messages';
import type { Prisma } from '../generated/prisma/client';
import { readSavedPhoto, replacePhoto } from '../photos/photo-files';
import { PHOTO_STORAGE, type PhotoStorage, type StoredPhoto } from '../photos/photo-storage';
import type { NewPhoto } from '../photos/photo-upload';
import { PrismaService } from '../prisma/prisma.service';
import { DRIVER_INCLUDE, fromIsoDay, toDriver, toDriverPayload } from './driver-mappers';
import { driverCountWhere, driverListWhere, driverOrder } from './driver-scope';

const stored = (fields: DriverFields) => ({
  ...fields,
  licenseExpiresOn: fromIsoDay(fields.licenseExpiresOn),
});

@Injectable()
export class DriversService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: FleetEvents,
    @Inject(PHOTO_STORAGE) private readonly photos: PhotoStorage,
  ) {}

  async list(branchId: string, query: DriverListQuery): Promise<DriverPage> {
    const where = driverListWhere(branchId, query, todayInGuatemala());
    const [rows, total, groups] = await this.prisma.$transaction([
      this.prisma.driver.findMany({
        where,
        include: DRIVER_INCLUDE,
        orderBy: driverOrder(query),
        ...pageArgs(query),
      }),
      this.prisma.driver.count({ where }),
      this.prisma.driver.groupBy({
        by: ['active'],
        where: driverCountWhere(branchId, query),
        orderBy: { active: 'asc' },
        _count: { _all: true },
      }),
    ]);
    return {
      ...toPage(rows.map(toDriver), total, query),
      summary: { statusCounts: toActiveCounts(groups) },
    };
  }

  async get(branchId: string, id: string): Promise<Driver> {
    return toDriver(await this.found(this.prisma, branchId, id));
  }

  async create(branchId: string, fields: DriverFields, correlationId?: string): Promise<Driver> {
    const row = await this.translateConflicts(() =>
      this.prisma.$transaction(async (tx) => {
        await assertBranchActive(tx, branchId);
        const driver = await tx.driver.create({
          data: { ...stored(fields), branchId },
          include: DRIVER_INCLUDE,
        });
        await this.events.driver(tx, 'DriverAdded', toDriverPayload(driver), correlationId);
        return driver;
      }),
    );
    await this.events.flush();
    return toDriver(row);
  }

  async update(
    branchId: string,
    id: string,
    fields: DriverFields,
    correlationId?: string,
  ): Promise<Driver> {
    const row = await this.translateConflicts(() =>
      this.prisma.$transaction(async (tx) => {
        await this.found(tx, branchId, id);
        const driver = await tx.driver.update({
          where: { id },
          data: { ...stored(fields), version: { increment: 1 } },
          include: DRIVER_INCLUDE,
        });
        await this.events.driver(tx, 'DriverUpdated', toDriverPayload(driver), correlationId);
        return driver;
      }),
    );
    await this.events.flush();
    return toDriver(row);
  }

  async setActive(
    branchId: string,
    id: string,
    active: boolean,
    correlationId?: string,
  ): Promise<void> {
    const changed = await this.prisma.$transaction(async (tx) => {
      // Locks the driver so a TripScheduled handled meanwhile waits and sees the final state.
      await tx.$queryRaw`SELECT id FROM drivers WHERE id = ${id}::uuid FOR UPDATE`;
      const driver = await this.found(tx, branchId, id);
      if (driver.active === active) return false;
      if (!active) {
        const trips = await tx.tripCopy.findMany({
          where: { driverId: id },
          select: { status: true },
        });
        if (hasPendingTrips(trips)) throw new ConflictException(FLEET_MESSAGES.driverHasTrips);
        await this.freeBus(tx, id, correlationId);
      }
      const updated = await tx.driver.update({
        where: { id },
        data: { active, version: { increment: 1 } },
      });
      await this.events.driver(tx, 'DriverUpdated', toDriverPayload(updated), correlationId);
      return true;
    });
    if (changed) await this.events.flush();
  }

  async savePhoto(branchId: string, id: string, photo: NewPhoto): Promise<void> {
    const driver = await this.found(this.prisma, branchId, id);
    await replacePhoto(this.photos, {
      kind: 'drivers',
      id,
      previousKey: driver.photoKey,
      photo,
      point: (photoKey) => this.prisma.driver.update({ where: { id }, data: { photoKey } }),
    });
  }

  async readPhoto(branchId: string, id: string): Promise<StoredPhoto> {
    const driver = await this.found(this.prisma, branchId, id);
    return readSavedPhoto(this.photos, driver.photoKey);
  }

  // A deactivated driver stops being the driver of his bus, so the bus can have another one.
  private async freeBus(
    tx: Prisma.TransactionClient,
    driverId: string,
    correlationId?: string,
  ): Promise<void> {
    const bus = await tx.bus.findUnique({ where: { assignedDriverId: driverId } });
    if (!bus) return;
    const freed = await tx.bus.update({
      where: { id: bus.id },
      data: { assignedDriverId: null, version: { increment: 1 } },
    });
    await this.events.bus(tx, 'BusUpdated', toBusPayload(freed), correlationId);
  }

  private async found(db: Prisma.TransactionClient, branchId: string, id: string) {
    const driver = await db.driver.findFirst({ where: { id, branchId }, include: DRIVER_INCLUDE });
    if (!driver) throw new NotFoundException(FLEET_MESSAGES.driverNotFound);
    return driver;
  }

  private async translateConflicts<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      throw new ConflictException(
        isConstraintViolation(error, 'license_number')
          ? FLEET_MESSAGES.licenseTaken
          : FLEET_MESSAGES.driverEmailTaken,
      );
    }
  }
}
