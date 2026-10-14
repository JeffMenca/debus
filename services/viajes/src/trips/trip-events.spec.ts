import {
  exampleTripCompleted,
  exampleTripDeleted,
  exampleTripDeparted,
  exampleTripScheduled,
  tripCompletedPayloadSchema,
  tripDeletedPayloadSchema,
  tripDepartedPayloadSchema,
} from '@debus/contracts';
import { Prisma } from '../generated/prisma/client';
import { toTripCompletedPayload, toTripDeletedPayload, toTripDepartedPayload } from './trip-events';

const userId = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const trip = {
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
  createdById: userId,
  searchText: '',
  createdAt: new Date(),
  updatedAt: new Date(),
};
const departure = {
  tripId: trip.id,
  departedAt: new Date(exampleTripDeparted.departedAt),
  startMileageKm: exampleTripDeparted.startMileageKm,
  recordedById: userId,
  recordedByRole: 'BRANCH_ADMIN' as const,
  createdAt: new Date(),
};
const arrival = {
  tripId: trip.id,
  arrivedAt: new Date(exampleTripCompleted.arrivedAt),
  endMileageKm: exampleTripCompleted.endMileageKm,
  fuelCost: new Prisma.Decimal('1250.00'),
  distanceKm: 202,
  depreciationPerKm: new Prisma.Decimal('1.50'),
  depreciationAmount: new Prisma.Decimal('303.00'),
  driverPay: new Prisma.Decimal('350.00'),
  settingsVersionId: userId,
  recordedById: userId,
  recordedByRole: 'DRIVER' as const,
  createdAt: new Date(),
};

describe('trip event payloads', () => {
  it('writes TripDeparted exactly as its example', () => {
    const payload = toTripDepartedPayload(trip, departure);

    expect(payload).toEqual(exampleTripDeparted);
    expect(tripDepartedPayloadSchema.parse(payload)).toEqual(payload);
  });

  it('writes TripCompleted exactly as its example, with plain numbers', () => {
    const payload = toTripCompletedPayload(trip, departure, arrival);

    expect(payload).toEqual(exampleTripCompleted);
    expect(tripCompletedPayloadSchema.parse(payload)).toEqual(payload);
  });

  it('writes TripDeleted exactly as its example', () => {
    const payload = toTripDeletedPayload(trip);

    expect(payload).toEqual(exampleTripDeleted);
    expect(tripDeletedPayloadSchema.parse(payload)).toEqual(payload);
  });
});
