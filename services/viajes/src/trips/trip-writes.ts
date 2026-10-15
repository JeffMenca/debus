import { setTimeout as delay } from 'node:timers/promises';
import { isConstraintViolation, isTransactionConflict } from '@debus/server';
import { ConflictException, Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { queueTripsOf } from './trip-locks';
import { TRIP_MESSAGES } from './trip-messages';

// The advisory locks keep simultaneous trips from deadlocking, but the database may still abort a
// transaction (or fail to start one when the pool is busy); running it again is safe and reaches the
// exclusion constraint, which answers with the busy text.
const DEADLOCK_ATTEMPTS = 5;
const TRANSACTION_MAX_WAIT_MS = 10_000;
// A short random pause keeps the retried transactions from colliding in the same order again.
const pauseBeforeRetry = (attempt: number) => delay(attempt * 20 + Math.floor(Math.random() * 40));

export interface TripTarget {
  busId: string;
  driverId: string;
  // A rental has no route.
  routeId: string | null;
}

// The one way to write a trip, shared by regular trips and rentals: the bus and the driver are
// queued, checked once more and written under the exclusion constraints, which decide the race.
@Injectable()
export class TripWrites {
  private readonly logger = new Logger(TripWrites.name);

  constructor(private readonly prisma: PrismaService) {}

  async write<T>(
    target: TripTarget,
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.retryingDeadlocks(() =>
        this.prisma.$transaction(
          async (tx) => {
            await queueTripsOf(tx, target.busId, target.driverId);
            await this.assertStillActive(tx, target);
            return work(tx);
          },
          // Trips queued behind a lock keep their connection until it is their turn.
          { maxWait: TRANSACTION_MAX_WAIT_MS },
        ),
      );
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

  // The copies were read before the call to flota; a bus, driver or route deactivated since then is refused here.
  private async assertStillActive(
    tx: Prisma.TransactionClient,
    { busId, driverId, routeId }: TripTarget,
  ): Promise<void> {
    const [bus, driver, route] = await Promise.all([
      tx.busCopy.findUnique({ where: { id: busId } }),
      tx.driverCopy.findUnique({ where: { id: driverId } }),
      routeId ? tx.routeCopy.findUnique({ where: { id: routeId } }) : null,
    ]);
    if (routeId && (!route || route.deleted || !route.active)) {
      throw new ConflictException(TRIP_MESSAGES.routeNotFound);
    }
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
