import { randomUUID } from 'node:crypto';
import { TEST_BRANCH_PREFIX, TEST_RUN } from '@debus/config/test-data';
import { exampleTripScheduled } from '@debus/contracts';
import type { PrismaService } from '../../src/prisma/prisma.service';

const HOUR_MS = 3_600_000;

export const inHours = (hours: number): string =>
  new Date(Date.now() + hours * HOUR_MS).toISOString();

// A TripScheduled payload for a new trip, leaving a few days from now unless told otherwise.
export const scheduledTrip = (over: Partial<typeof exampleTripScheduled> = {}) => ({
  ...exampleTripScheduled,
  tripId: randomUUID(),
  departureAt: inHours(72),
  estimatedArrivalAt: inHours(76),
  ...over,
});

// Labels start with the prefix of the test data, so pnpm test:clean finds the trips of this run.
export const testLabel = (label: string): string => `${TEST_BRANCH_PREFIX}${TEST_RUN} ${label}`;

export type TestTrips = ReturnType<typeof testTrips>;

// Every trip a test creates is remembered here and removed with its tickets and seats.
export function testTrips(prisma: PrismaService) {
  const created: string[] = [];
  return {
    async create(over: Partial<typeof exampleTripScheduled> = {}): Promise<string> {
      const trip = scheduledTrip(over);
      created.push(trip.tripId);
      await prisma.trip.create({
        data: {
          tripId: trip.tripId,
          branchId: trip.branchId,
          routeId: trip.routeId ?? randomUUID(),
          busId: trip.busId,
          busPlate: trip.busPlate,
          originLabel: testLabel(trip.originLabel),
          destinationLabel: testLabel(trip.destinationLabel),
          capacity: trip.capacity,
          ticketPrice: trip.ticketPrice ?? 0,
          departureAt: new Date(trip.departureAt),
          estimatedArrivalAt: new Date(trip.estimatedArrivalAt),
          searchText: '',
        },
      });
      return trip.tripId;
    },
    // A ticket written straight to the table, for tests about what happens to it afterwards.
    async ticket(
      tripId: string,
      over: {
        nit?: string;
        channel?: 'ONLINE' | 'COUNTER';
        clientId?: string | null;
        status?: 'PENDING' | 'CONFIRMED';
      } = {},
    ): Promise<string> {
      const id = randomUUID();
      await prisma.ticket.create({
        data: {
          id,
          tripId,
          status: over.status ?? 'CONFIRMED',
          channel: over.channel ?? 'COUNTER',
          clientId: over.clientId ?? null,
          nit: over.nit ?? 'CF',
          buyerName: 'Consumidor final',
          unitPrice: 85,
          total: 85,
          paidOn: new Date('2026-10-18T00:00:00.000Z'),
        },
      });
      return id;
    },
    track(tripId: string): void {
      created.push(tripId);
    },
    async cleanUp(): Promise<void> {
      await prisma.trip.deleteMany({ where: { tripId: { in: created } } });
    },
  };
}
