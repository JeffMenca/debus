import { EXAMPLE_IDS } from './fleet-examples';
import {
  type RentalCancelledPayload,
  type TripCompletedPayload,
  type TripDeletedPayload,
  type TripDepartedPayload,
  type TripScheduledPayload,
  rentalCancelledPayloadSchema,
  tripCompletedPayloadSchema,
  tripDeletedPayloadSchema,
  tripDepartedPayloadSchema,
  tripScheduledPayloadSchema,
} from './trip-payloads';

export const exampleTripScheduled: TripScheduledPayload = {
  tripId: EXAMPLE_IDS.trip,
  type: 'REGULAR',
  branchId: EXAMPLE_IDS.branch,
  routeId: EXAMPLE_IDS.route,
  originLabel: 'Quetzaltenango',
  destinationLabel: 'Guatemala',
  busId: EXAMPLE_IDS.bus,
  busPlate: 'C482BTX',
  capacity: 40,
  driverId: EXAMPLE_IDS.driver,
  ticketPrice: 85,
  departureAt: '2026-10-20T11:30:00.000Z',
  estimatedArrivalAt: '2026-10-20T15:45:00.000Z',
  rentalId: null,
};

export const exampleTripDeleted: TripDeletedPayload = {
  tripId: EXAMPLE_IDS.trip,
  type: 'REGULAR',
  branchId: EXAMPLE_IDS.branch,
  busId: EXAMPLE_IDS.bus,
  driverId: EXAMPLE_IDS.driver,
  departureAt: exampleTripScheduled.departureAt,
};

export const exampleTripDeparted: TripDepartedPayload = {
  tripId: EXAMPLE_IDS.trip,
  branchId: EXAMPLE_IDS.branch,
  busId: EXAMPLE_IDS.bus,
  driverId: EXAMPLE_IDS.driver,
  departedAt: '2026-10-20T11:34:00.000Z',
  startMileageKm: 148410,
};

export const exampleTripCompleted: TripCompletedPayload = {
  tripId: EXAMPLE_IDS.trip,
  type: 'REGULAR',
  branchId: EXAMPLE_IDS.branch,
  routeId: EXAMPLE_IDS.route,
  busId: EXAMPLE_IDS.bus,
  driverId: EXAMPLE_IDS.driver,
  departedAt: exampleTripDeparted.departedAt,
  arrivedAt: '2026-10-20T15:50:00.000Z',
  startMileageKm: 148410,
  endMileageKm: 148612,
  fuelCost: 1250,
  depreciationPerKm: 1.5,
  depreciationAmount: 303,
  driverPay: 350,
};

export const exampleRentalCancelled: RentalCancelledPayload = {
  rentalId: EXAMPLE_IDS.rental,
  branchId: EXAMPLE_IDS.branch,
  tripId: EXAMPLE_IDS.trip,
  cancelledAt: '2026-10-22T14:00:00.000Z',
};

export const TRIP_PAYLOAD_SCHEMAS = {
  TripScheduled: tripScheduledPayloadSchema,
  TripDeleted: tripDeletedPayloadSchema,
  TripDeparted: tripDepartedPayloadSchema,
  TripCompleted: tripCompletedPayloadSchema,
  RentalCancelled: rentalCancelledPayloadSchema,
} as const;

export const TRIP_EXAMPLES: Record<keyof typeof TRIP_PAYLOAD_SCHEMAS, unknown> = {
  TripScheduled: exampleTripScheduled,
  TripDeleted: exampleTripDeleted,
  TripDeparted: exampleTripDeparted,
  TripCompleted: exampleTripCompleted,
  RentalCancelled: exampleRentalCancelled,
};
