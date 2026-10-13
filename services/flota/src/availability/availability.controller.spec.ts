import { AvailabilityController } from './availability.controller';

describe('AvailabilityController', () => {
  it('answers with what the service says', async () => {
    const answer = { bus: { available: true }, driver: { available: true } };
    const availability = { check: jest.fn().mockResolvedValue(answer) };
    const query = { busId: 'b' } as never;

    const result = await new AvailabilityController(availability as never).check(query);

    expect(result).toBe(answer);
    expect(availability.check).toHaveBeenCalledWith(query);
  });
});
