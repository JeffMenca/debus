import type { Prisma } from '../generated/prisma/client';

// flota raises the mileage of a bus when a trip completes and does not publish it again, so the
// copy of viajes can lag behind its own last arrival. The mileage a bus can leave with is the
// higher of the copy and the last arrival recorded here.
export async function lastMileageKm(
  db: Pick<Prisma.TransactionClient, 'tripArrival'>,
  busId: string,
  copyMileageKm: number,
): Promise<number> {
  const last = await db.tripArrival.aggregate({
    _max: { endMileageKm: true },
    where: { trip: { busId } },
  });
  return Math.max(copyMileageKm, last._max.endMileageKm ?? 0);
}
