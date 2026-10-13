import { setTimeout as delay } from 'node:timers/promises';
import {
  type ScheduleTripRequest,
  type Trip,
  type TripListQuery,
  type TripPage,
  pageArgs,
  toPage,
} from '@debus/contracts';
import { Outbox, REQUEST_FLUSH } from '@debus/messaging';
import {
  type Identity,
  isConstraintViolation,
  isTransactionConflict,
  requireBranch,
} from '@debus/server';
import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FleetClient } from './fleet-client';
import { toTrip, toTripScheduledPayload } from './trip-mappers';
import { TRIP_MESSAGES } from './trip-messages';
import { availabilityProblem, scheduleProblem } from './trip-rules';
import { tripListWhere, tripOrder } from './trip-scope';

// The advisory locks keep simultaneous trips from deadlocking, but the database may still abort a
// transaction (or fail to start one when the pool is busy); running it again is safe and reaches the
// exclusion constraint, which answers with the busy text.
const DEADLOCK_ATTEMPTS = 5;
const TRANSACTION_MAX_WAIT_MS = 10_000;
// A short random pause keeps the retried transactions from colliding in the same order again.
const pauseBeforeRetry = (attempt: number) => delay(attempt * 20 + Math.floor(Math.random() * 40));

@Injectable()
export class TripsService {
  private readonly logger = new Logger(TripsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fleet: FleetClient,
    private readonly outbox: Outbox,
  ) {}

  async list(branchId: string, query: TripListQuery): Promise<TripPage> {
    const where = tripListWhere(branchId, query);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.trip.findMany({ where, orderBy: tripOrder(), ...pageArgs(query) }),
      this.prisma.trip.count({ where }),
    ]);
    return toPage(rows.map(toTrip), total, query);
  }

  async get(branchId: string, id: string): Promise<Trip> {
    const trip = await this.prisma.trip.findFirst({ where: { id, branchId } });
    if (!trip) throw new NotFoundException(TRIP_MESSAGES.tripNotFound);
    return toTrip(trip);
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

    const [origin, destination] = await Promise.all([
      this.prisma.branchCopy.findUnique({ where: { id: branchId } }),
      checked.route.destinationBranchId
        ? this.prisma.branchCopy.findUnique({ where: { id: checked.route.destinationBranchId } })
        : null,
    ]);
    if (!origin || !destination) throw new ConflictException(TRIP_MESSAGES.routeNotFound);

    try {
      const row = await this.retryingDeadlocks(() =>
        this.prisma.$transaction(
          async (tx) => {
            await this.queueFor(tx, checked.bus.id, checked.driver.id);
            await this.assertStillActive(tx, checked.bus.id, checked.driver.id);
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
          // Trips queued behind a lock keep their connection until it is their turn.
          { maxWait: TRANSACTION_MAX_WAIT_MS },
        ),
      );
      await this.outbox.flush(REQUEST_FLUSH);
      return toTrip(row);
    } catch (error) {
      if (isConstraintViolation(error, 'trips_bus_no_overlap')) {
        throw new ConflictException(TRIP_MESSAGES.busBusy);
      }
      if (isConstraintViolation(error, 'trips_driver_no_overlap')) {
        throw new ConflictException(TRIP_MESSAGES.driverBusy);
      }
      if (isTransactionConflict(error)) throw new ConflictException(TRIP_MESSAGES.tripContended);
      throw error;
    }
  }

  // Trips of the same bus or driver wait for each other here, one after the other and always bus
  // first, so the exclusion constraints below never have two transactions waiting for each other
  // (no deadlocks) and a request that loses answers as soon as the winner commits.
  private async queueFor(tx: Prisma.TransactionClient, busId: string, driverId: string) {
    for (const key of [`trip-bus:${busId}`, `trip-driver:${driverId}`]) {
      await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', key);
    }
  }

  // The copies were read before the call to flota; a bus or driver deactivated since then is refused here.
  private async assertStillActive(
    tx: Prisma.TransactionClient,
    busId: string,
    driverId: string,
  ): Promise<void> {
    const [bus, driver] = await Promise.all([
      tx.busCopy.findUnique({ where: { id: busId } }),
      tx.driverCopy.findUnique({ where: { id: driverId } }),
    ]);
    if (!bus?.active) throw new ConflictException(TRIP_MESSAGES.busInactive);
    if (!driver?.active) throw new ConflictException(TRIP_MESSAGES.driverInactive);
  }

  private async retryingDeadlocks<T>(work: () => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await work();
      } catch (error) {
        if (!isTransactionConflict(error) || attempt >= DEADLOCK_ATTEMPTS) throw error;
        this.logger.warn(
          { attempt, code: (error as { code?: string }).code },
          'Trying the trip again after a database conflict',
        );
        await pauseBeforeRetry(attempt);
      }
    }
  }
}
