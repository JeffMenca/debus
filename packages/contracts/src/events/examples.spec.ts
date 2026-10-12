import { consumersOf, eventsConsumedBy, EVENT_TYPES } from './registry';
import { eventDrivenShare } from './sync-calls';
import { FLEET_EXAMPLES, FLEET_PAYLOAD_SCHEMAS } from './fleet-examples';
import { TRIP_EXAMPLES, TRIP_PAYLOAD_SCHEMAS } from './trip-examples';
import { exampleRepairExpenseAdded } from './expense-examples';
import { exampleBus } from './fleet-examples';
import { busChangedPayloadSchema } from './fleet-payloads';
import { exampleTripCompleted } from './trip-examples';
import { tripCompletedPayloadSchema } from './trip-payloads';
import { repairExpenseAddedPayloadSchema } from './expense-payloads';

describe('event examples', () => {
  it.each(Object.entries(FLEET_EXAMPLES))('the %s example fits its schema', (type, payload) => {
    expect(
      FLEET_PAYLOAD_SCHEMAS[type as keyof typeof FLEET_PAYLOAD_SCHEMAS].parse(payload),
    ).toEqual(payload);
  });

  it.each(Object.entries(TRIP_EXAMPLES))('the %s example fits its schema', (type, payload) => {
    expect(TRIP_PAYLOAD_SCHEMAS[type as keyof typeof TRIP_PAYLOAD_SCHEMAS].parse(payload)).toEqual(
      payload,
    );
  });

  it('the repair expense example fits and its total is the sum of its lines', () => {
    const parsed = repairExpenseAddedPayloadSchema.parse(exampleRepairExpenseAdded);
    expect(parsed.total).toBe(parsed.lines.reduce((sum, line) => sum + line.amount, 0));
    expect(
      repairExpenseAddedPayloadSchema.safeParse({ ...exampleRepairExpenseAdded, total: 1 }).success,
    ).toBe(false);
  });
});

describe('bus snapshot', () => {
  it('does not reject a year the producer accepted, whatever the consumer clock says', () => {
    const nextYear = new Date().getFullYear() + 5;

    expect(busChangedPayloadSchema.safeParse({ ...exampleBus, year: nextYear }).success).toBe(true);
    expect(busChangedPayloadSchema.safeParse({ ...exampleBus, year: 1900 }).success).toBe(false);
  });
});

describe('trip completion', () => {
  it('never ends with a lower mileage than it started with', () => {
    const lower = {
      ...exampleTripCompleted,
      endMileageKm: exampleTripCompleted.startMileageKm - 1,
    };

    expect(tripCompletedPayloadSchema.safeParse(lower).success).toBe(false);
    expect(
      tripCompletedPayloadSchema.safeParse({
        ...exampleTripCompleted,
        endMileageKm: exampleTripCompleted.startMileageKm,
      }).success,
    ).toBe(true);
  });
});

describe('registry after the fleet pack', () => {
  it('adds RouteUpdated for the copies of viajes and reportes', () => {
    expect(EVENT_TYPES).toContain('RouteUpdated');
    expect(consumersOf('RouteUpdated')).toEqual(['viajes', 'reportes']);
  });

  it('lets flota follow every trip of its buses', () => {
    expect(eventsConsumedBy('flota')).toEqual(
      expect.arrayContaining(['TripScheduled', 'TripDeleted', 'TripDeparted', 'TripCompleted']),
    );
  });

  it('lets administracion open the driver accounts', () => {
    expect(eventsConsumedBy('administracion')).toEqual(
      expect.arrayContaining(['DriverAdded', 'DriverUpdated']),
    );
  });

  it('keeps more than half of the communication event driven', () => {
    expect(eventDrivenShare()).toBeCloseTo(21 / 25);
  });
});
