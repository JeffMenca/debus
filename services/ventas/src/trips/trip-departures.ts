import type { PrismaService } from '../prisma/prisma.service';

// Whether the bus of the trip already left, as announced by TripDeparted or TripCompleted.
export async function hasDeparted(
  prisma: Pick<PrismaService, 'departedTrip'>,
  tripId: string,
): Promise<boolean> {
  return (await prisma.departedTrip.count({ where: { tripId } })) > 0;
}
