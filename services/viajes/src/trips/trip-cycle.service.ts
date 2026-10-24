import {
  type RecordArrivalRequest,
  type RecordDepartureRequest,
  type TripDetail,
  todayInGuatemala,
} from '@debus/contracts';
import { Outbox, REQUEST_FLUSH } from '@debus/messaging';
import { type Identity, isUniqueViolation } from '@debus/server';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsCopyService } from '../settings/settings-copy.service';
import { lastMileageKm } from './bus-mileage';
import { tripAccessWhere } from './trip-access';
import {
  arrivalProblem,
  costsProblem,
  deletionProblem,
  departureProblem,
  tripCosts,
} from './trip-cycle-rules';
import { deleteTripIn } from './trip-deletion';
import { toTripCompletedPayload, toTripDepartedPayload } from './trip-events';
import { queueTripsOf } from './trip-locks';
import { TRIP_MESSAGES, type TripProblem } from './trip-messages';
import { TripsService } from './trips.service';

const refuse = (problem: TripProblem | null) => {
  if (problem) throw new ConflictException(TRIP_MESSAGES[problem]);
};

// Only a branch admin or a driver reaches the cycle, so the role is one of the two the record keeps.
const recordedBy = (actor: Identity) => ({
  recordedById: actor.userId,
  recordedByRole: actor.role === 'DRIVER' ? ('DRIVER' as const) : ('BRANCH_ADMIN' as const),
});

@Injectable()
export class TripCycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: Outbox,
    private readonly settings: SettingsCopyService,
    private readonly trips: TripsService,
  ) {}

  async recordDeparture(
    actor: Identity,
    tripId: string,
    input: RecordDepartureRequest,
    correlationId?: string,
  ): Promise<TripDetail> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const trip = await this.lockTrip(tx, actor, tripId);
        // Departures of different trips of one bus or driver queue here, so each one sees the last.
        await queueTripsOf(tx, trip.busId, trip.driverId);
        const [bus, driver, busOnAnotherTrip, driverOnAnotherTrip] = await Promise.all([
          tx.busCopy.findUnique({ where: { id: trip.busId } }),
          tx.driverCopy.findUnique({ where: { id: trip.driverId } }),
          this.onTheRoadElsewhere(tx, tripId, { busId: trip.busId }),
          this.onTheRoadElsewhere(tx, tripId, { driverId: trip.driverId }),
        ]);
        refuse(
          departureProblem({
            status: trip.status,
            busActive: bus?.active ?? false,
            driverActive: driver?.active ?? false,
            busOnAnotherTrip,
            driverOnAnotherTrip,
            busMileageKm: bus ? await lastMileageKm(tx, trip.busId, bus.mileageKm) : 0,
            startMileageKm: input.startMileageKm,
            departedAt: input.departedAt,
            scheduledAt: trip.departureAt,
            now: new Date(),
          }),
        );
        const departure = await tx.tripDeparture.create({
          data: {
            tripId,
            departedAt: new Date(input.departedAt),
            startMileageKm: input.startMileageKm,
            ...recordedBy(actor),
          },
        });
        await tx.trip.update({ where: { id: tripId }, data: { status: 'IN_TRANSIT' } });
        await this.outbox.add(
          tx,
          'TripDeparted',
          toTripDepartedPayload(trip, departure),
          correlationId,
        );
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException(TRIP_MESSAGES.alreadyDeparted);
      throw error;
    }
    await this.outbox.flush(REQUEST_FLUSH);
    return this.trips.loadDetail({ id: tripId, ...tripAccessWhere(actor) });
  }

  async recordArrival(
    actor: Identity,
    tripId: string,
    input: RecordArrivalRequest,
    correlationId?: string,
  ): Promise<TripDetail> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const trip = await this.lockTrip(tx, actor, tripId);
        const departure = await tx.tripDeparture.findUnique({ where: { tripId } });
        if (!departure) throw new ConflictException(TRIP_MESSAGES.notOnTheRoad);
        refuse(
          arrivalProblem({
            status: trip.status,
            departedAt: departure.departedAt,
            startMileageKm: departure.startMileageKm,
            arrivedAt: input.arrivedAt,
            endMileageKm: input.endMileageKm,
            now: new Date(),
          }),
        );
        // The amount in force on the day the bus arrives, in Guatemala time.
        const rate = await this.settings.effectiveOn(todayInGuatemala(new Date(input.arrivedAt)));
        if (!rate) throw new ConflictException(TRIP_MESSAGES.noDepreciationRate);
        // The pay is fixed for good, so a driver without a copy is refused instead of paid nothing.
        const driver = await tx.driverCopy.findUnique({ where: { id: trip.driverId } });
        if (!driver) throw new ConflictException(TRIP_MESSAGES.driverCopyMissing);
        const costs = tripCosts({
          type: trip.type,
          startMileageKm: departure.startMileageKm,
          endMileageKm: input.endMileageKm,
          depreciationPerKm: rate.depreciationPerKm,
          baseSalary: driver.baseSalary.toNumber(),
        });
        refuse(costsProblem(costs));
        const arrival = await tx.tripArrival.create({
          data: {
            tripId,
            arrivedAt: new Date(input.arrivedAt),
            endMileageKm: input.endMileageKm,
            fuelCost: input.fuelCost,
            distanceKm: costs.distanceKm,
            depreciationPerKm: rate.depreciationPerKm,
            depreciationAmount: costs.depreciationAmount,
            driverPay: costs.driverPay,
            settingsVersionId: rate.versionId,
            ...recordedBy(actor),
          },
        });
        await tx.trip.update({ where: { id: tripId }, data: { status: 'COMPLETED' } });
        await this.outbox.add(
          tx,
          'TripCompleted',
          toTripCompletedPayload(trip, departure, arrival),
          correlationId,
        );
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException(TRIP_MESSAGES.alreadyArrived);
      throw error;
    }
    await this.outbox.flush(REQUEST_FLUSH);
    return this.trips.loadDetail({ id: tripId, ...tripAccessWhere(actor) });
  }

  async remove(actor: Identity, tripId: string, correlationId?: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const trip = await this.lockTrip(tx, actor, tripId);
      refuse(deletionProblem(trip.status));
      await deleteTripIn(tx, this.outbox, trip, correlationId);
      // A rental is already paid: deleting its trip sends it back to be assigned again.
      if (trip.rentalId) {
        await tx.rentalRequest.update({
          where: { id: trip.rentalId },
          data: { status: 'PENDING', tripId: null },
        });
      }
    });
    await this.outbox.flush(REQUEST_FLUSH);
  }

  // Another trip of the same bus or driver that left and has not arrived yet.
  private async onTheRoadElsewhere(
    tx: Prisma.TransactionClient,
    tripId: string,
    owner: { busId: string } | { driverId: string },
  ): Promise<boolean> {
    const other = await tx.trip.findFirst({
      where: { ...owner, status: 'IN_TRANSIT', id: { not: tripId } },
      select: { id: true },
    });
    return other !== null;
  }

  // The row lock makes departure, arrival and deletion of one trip run one after the other.
  private async lockTrip(tx: Prisma.TransactionClient, actor: Identity, tripId: string) {
    await tx.$queryRawUnsafe('SELECT id FROM trips WHERE id = $1::uuid FOR UPDATE', tripId);
    const trip = await tx.trip.findFirst({ where: { id: tripId, ...tripAccessWhere(actor) } });
    if (!trip) throw new NotFoundException(TRIP_MESSAGES.tripNotFound);
    return trip;
  }
}
