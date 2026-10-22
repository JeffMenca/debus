import type { Outbox } from '@debus/messaging';
import type { Prisma } from '../generated/prisma/client';
import { type TripRow, toTripDeletedPayload } from './trip-events';

// Deletes a trip that has not left and announces it: flota frees the bus, ventas drops its seats.
// The caller holds the trip row lock and decided that it may go.
export async function deleteTripIn(
  tx: Prisma.TransactionClient,
  outbox: Outbox,
  trip: TripRow,
  correlationId?: string,
): Promise<void> {
  await tx.trip.delete({ where: { id: trip.id } });
  await outbox.add(tx, 'TripDeleted', toTripDeletedPayload(trip), correlationId);
}
