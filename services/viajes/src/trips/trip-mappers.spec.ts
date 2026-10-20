import { exampleTripScheduled, tripScheduledPayloadSchema, tripSchema } from '@debus/contracts';
import { Prisma } from '../generated/prisma/client';
import { toTrip, toTripScheduledPayload } from './trip-mappers';

const row = {
  id: exampleTripScheduled.tripId,
  type: 'REGULAR' as const,
  status: 'SCHEDULED' as const,
  branchId: exampleTripScheduled.branchId,
  routeId: exampleTripScheduled.routeId,
  busId: exampleTripScheduled.busId,
  busPlate: 'C482BTX',
  capacity: 40,
  driverId: exampleTripScheduled.driverId,
  driverName: 'Julio Pérez',
  originLabel: 'Quetzaltenango',
  destinationLabel: 'Guatemala',
  departureAt: new Date(exampleTripScheduled.departureAt),
  estimatedArrivalAt: new Date(exampleTripScheduled.estimatedArrivalAt),
  ticketPrice: new Prisma.Decimal('85.00'),
  rentalId: null,
  createdById: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  searchText: 'ignored',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('trip mappers', () => {
  it('shows a trip with plain numbers and ISO instants', () => {
    expect(tripSchema.parse(toTrip(row))).toEqual({
      id: row.id,
      type: 'REGULAR',
      status: 'SCHEDULED',
      branchId: row.branchId,
      routeId: row.routeId,
      originName: 'Quetzaltenango',
      destinationName: 'Guatemala',
      busId: row.busId,
      busPlate: 'C482BTX',
      driverId: row.driverId,
      driverName: 'Julio Pérez',
      departureAt: '2026-10-20T11:30:00.000Z',
      estimatedArrivalAt: '2026-10-20T15:45:00.000Z',
      ticketPrice: 85,
      capacity: 40,
      departedAt: null,
    });
  });

  it('carries the real departure instant once the bus left', () => {
    const departure = { departedAt: new Date('2026-10-20T11:42:00.000Z') };

    expect(toTrip({ ...row, departure }).departedAt).toBe('2026-10-20T11:42:00.000Z');
  });

  it('has no ticket price for a trip that sells no seats', () => {
    expect(toTrip({ ...row, ticketPrice: null }).ticketPrice).toBeNull();
  });

  it('builds the event that fits its contract', () => {
    expect(tripScheduledPayloadSchema.parse(toTripScheduledPayload(row))).toEqual(
      exampleTripScheduled,
    );
  });
});
