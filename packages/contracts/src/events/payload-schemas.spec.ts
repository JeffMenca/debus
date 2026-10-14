import { EVENT_TYPES, type EventType } from './registry';
import { exampleTripCompleted } from './trip-examples';
import { EVENT_PAYLOAD_SCHEMAS, validateEventPayload } from './payload-schemas';
import { FLEET_EXAMPLES } from './fleet-examples';
import { TRIP_EXAMPLES } from './trip-examples';
import { CLIENT_EXAMPLES } from './client-examples';
import { EVENT_AMOUNT_MAX } from './limits';

// TicketSold and RefundRequested get their schemas with the sales pack.
const WITHOUT_SCHEMA_YET: EventType[] = ['TicketSold', 'RefundRequested'];

describe('event payload schemas', () => {
  it('cover every event type except the ones whose contract is still to come', () => {
    const missing = EVENT_TYPES.filter((type) => !(type in EVENT_PAYLOAD_SCHEMAS));

    expect(missing).toEqual(WITHOUT_SCHEMA_YET);
  });

  it('accept the examples of the contract', () => {
    const examples = { ...FLEET_EXAMPLES, ...TRIP_EXAMPLES, ...CLIENT_EXAMPLES };

    for (const [type, payload] of Object.entries(examples)) {
      expect(validateEventPayload(type as EventType, payload)).toEqual({ valid: true });
    }
  });

  it('name the type and the field when a payload breaks its contract', () => {
    const result = validateEventPayload('TripCompleted', {
      ...exampleTripCompleted,
      depreciationAmount: EVENT_AMOUNT_MAX + 1,
    });

    expect(result).toEqual({
      valid: false,
      reason: expect.stringContaining('depreciationAmount'),
    });
  });

  it('lets a type without a schema through', () => {
    expect(validateEventPayload('TicketSold', { anything: true })).toEqual({ valid: true });
  });
});
