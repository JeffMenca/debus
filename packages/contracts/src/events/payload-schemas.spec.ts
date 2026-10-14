import { EVENT_TYPES, type EventType } from './registry';
import { exampleTripCompleted } from './trip-examples';
import { EVENT_PAYLOAD_SCHEMAS, validateEventPayload } from './payload-schemas';
import { FLEET_EXAMPLES } from './fleet-examples';
import { TRIP_EXAMPLES } from './trip-examples';
import { CLIENT_EXAMPLES } from './client-examples';
import { SALES_EXAMPLES } from './sales-examples';
import { EVENT_AMOUNT_MAX } from './limits';

describe('event payload schemas', () => {
  it('cover every event type', () => {
    const missing = EVENT_TYPES.filter((type) => !(type in EVENT_PAYLOAD_SCHEMAS));

    expect(missing).toEqual([]);
  });

  it('accept the examples of the contract', () => {
    const examples = { ...FLEET_EXAMPLES, ...TRIP_EXAMPLES, ...CLIENT_EXAMPLES, ...SALES_EXAMPLES };

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
});
