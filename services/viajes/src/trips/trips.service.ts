import {
  type ScheduleTripRequest,
  type Trip,
  type TripDetail,
  type TripListQuery,
  type TripPage,
  pageArgs,
  todayInGuatemala,
  toPage,
} from '@debus/contracts';
import { Outbox, REQUEST_FLUSH } from '@debus/messaging';
import { type Identity, requireBranch } from '@debus/server';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsCopyService } from '../settings/settings-copy.service';
import { lastMileageKm } from './bus-mileage';
import { FleetClient } from './fleet-client';
import { tripAccessWhere } from './trip-access';
import { TRIP_DETAIL_INCLUDE, toTripDetail } from './trip-detail';
import { TRIP_LIST_INCLUDE, toTrip, toTripScheduledPayload } from './trip-mappers';
import { TRIP_MESSAGES } from './trip-messages';
import { availabilityProblem, branchesProblem, scheduleProblem } from './trip-rules';
import { tripListWhere, tripOrder } from './trip-scope';
import { TripWrites } from './trip-writes';

@Injectable()
export class TripsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fleet: FleetClient,
    private readonly outbox: Outbox,
    private readonly settings: SettingsCopyService,
    private readonly writes: TripWrites,
  ) {}

  async list(actor: Identity, query: TripListQuery): Promise<TripPage> {
    const where = { ...tripListWhere(query), ...tripAccessWhere(actor) };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.trip.findMany({
        where,
        include: TRIP_LIST_INCLUDE,
        orderBy: tripOrder(),
        ...pageArgs(query),
      }),
      this.prisma.trip.count({ where }),
    ]);
    return toPage(rows.map(toTrip), total, query);
  }

  get(actor: Identity, id: string): Promise<TripDetail> {
    return this.loadDetail({ id, ...tripAccessWhere(actor) });
  }

  // The trip, both records and what the screen needs around them, for whoever may see it.
  async loadDetail(where: Prisma.TripWhereInput): Promise<TripDetail> {
    const row = await this.prisma.trip.findFirst({ where, include: TRIP_DETAIL_INCLUDE });
    if (!row) throw new NotFoundException(TRIP_MESSAGES.tripNotFound);
    const [bus, driver, route, rental, rate] = await Promise.all([
      this.busWithMileage(row.busId),
      this.prisma.driverCopy.findUnique({ where: { id: row.driverId } }),
      row.routeId ? this.prisma.routeCopy.findUnique({ where: { id: row.routeId } }) : null,
      row.rentalId ? this.prisma.rentalRequest.findUnique({ where: { id: row.rentalId } }) : null,
      this.settings.effectiveOn(todayInGuatemala()),
    ]);
    return toTripDetail(row, {
      bus,
      driver: driver && { active: driver.active, baseSalary: driver.baseSalary.toNumber() },
      distanceKm: (route?.distanceKm ?? rental?.distanceKm)?.toNumber() ?? null,
      depreciationPerKmToday: rate?.depreciationPerKm ?? null,
    });
  }

  private async busWithMileage(busId: string) {
    const bus = await this.prisma.busCopy.findUnique({ where: { id: busId } });
    if (!bus) return null;
    return {
      active: bus.active,
      mileageKm: await lastMileageKm(this.prisma, busId, bus.mileageKm),
    };
  }

  async schedule(
    actor: Identity,
    input: ScheduleTripRequest,
    correlationId?: string,
  ): Promise<Trip> {
    const branchId = requireBranch(actor);
    const [route, bus, driver] = await Promise.all([
      this.prisma.routeCopy.findUnique({ where: { id: input.routeId } }),
      this.prisma.busCopy.findUnique({ where: { id: input.busId } }),
      this.prisma.driverCopy.findUnique({ where: { id: input.driverId } }),
    ]);
    const checked = scheduleProblem({
      branchId,
      route,
      bus,
      driver,
      departureAt: input.departureAt,
      now: new Date(),
    });
    if (!checked.ok) throw new ConflictException(TRIP_MESSAGES[checked.problem]);

    const [origin, destination] = await Promise.all([
      this.prisma.branchCopy.findUnique({ where: { id: branchId } }),
      checked.route.destinationBranchId
        ? this.prisma.branchCopy.findUnique({ where: { id: checked.route.destinationBranchId } })
        : null,
    ]);
    const branches = branchesProblem(origin, destination);
    if (branches || !origin || !destination) {
      throw new ConflictException(TRIP_MESSAGES[branches ?? 'routeNotFound']);
    }

    // The question to flota goes before the write; the exclusion constraints below decide the race.
    const availability = await this.fleet.availability(
      {
        branchId,
        busId: input.busId,
        driverId: input.driverId,
        departureAt: input.departureAt,
        estimatedArrivalAt: input.estimatedArrivalAt,
      },
      correlationId,
    );
    const unavailable = availabilityProblem(availability);
    if (unavailable) throw new ConflictException(TRIP_MESSAGES[unavailable]);

    const row = await this.writes.write(
      { busId: checked.bus.id, driverId: checked.driver.id, routeId: checked.route.id },
      async (tx) => {
        const trip = await tx.trip.create({
          data: {
            type: 'REGULAR',
            status: 'SCHEDULED',
            branchId,
            routeId: checked.route.id,
            busId: checked.bus.id,
            busPlate: checked.bus.plate,
            capacity: checked.bus.capacity,
            driverId: checked.driver.id,
            driverName: checked.driver.fullName,
            originLabel: origin.name,
            destinationLabel: destination.name,
            departureAt: new Date(input.departureAt),
            estimatedArrivalAt: new Date(input.estimatedArrivalAt),
            ticketPrice: checked.route.ticketPrice,
            createdById: actor.userId,
          },
        });
        await this.outbox.add(tx, 'TripScheduled', toTripScheduledPayload(trip), correlationId);
        return trip;
      },
    );
    await this.outbox.flush(REQUEST_FLUSH);
    return toTrip(row);
  }
}
