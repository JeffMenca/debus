import type { Prisma } from '../generated/prisma/client';

// Trips of the same bus or driver wait for each other here, one after the other and always bus
// first, so the exclusion constraints never have two transactions waiting for each other (no
// deadlocks) and a request that loses answers as soon as the winner commits.
export async function queueTripsOf(
  tx: Prisma.TransactionClient,
  busId: string,
  driverId: string,
): Promise<void> {
  for (const key of [`trip-bus:${busId}`, `trip-driver:${driverId}`]) {
    await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', key);
  }
}
