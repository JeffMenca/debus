import { saleStatusSchema, scheduleTripRequestSchema, tripListQuerySchema } from './trips';

const ids = () => ({
  routeId: crypto.randomUUID(),
  busId: crypto.randomUUID(),
  driverId: crypto.randomUUID(),
});

describe('trip contracts', () => {
  it('needs the estimated arrival after the departure', () => {
    const departureAt = '2026-10-20T12:00:00.000Z';
    expect(
      scheduleTripRequestSchema.safeParse({
        ...ids(),
        departureAt,
        estimatedArrivalAt: '2026-10-20T16:00:00.000Z',
      }).success,
    ).toBe(true);
    expect(
      scheduleTripRequestSchema.safeParse({
        ...ids(),
        departureAt,
        estimatedArrivalAt: departureAt,
      }).success,
    ).toBe(false);
  });

  it('compares the arrival and the departure as instants, whatever their precision', () => {
    const request = (departureAt: string, estimatedArrivalAt: string) =>
      scheduleTripRequestSchema.safeParse({ ...ids(), departureAt, estimatedArrivalAt }).success;

    expect(request('2026-10-20T10:00:00.500Z', '2026-10-20T10:00:00Z')).toBe(false);
    expect(request('2026-10-20T10:00:00Z', '2026-10-20T10:00:00.000Z')).toBe(false);
    expect(request('2026-10-20T10:00:00.500Z', '2026-10-20T10:00:01Z')).toBe(true);
  });

  it('filters trips by day range and status with pages', () => {
    expect(tripListQuerySchema.parse({ from: '2026-10-20', to: '2026-10-21' })).toEqual({
      from: '2026-10-20',
      to: '2026-10-21',
      status: 'all',
      page: 1,
      pageSize: 20,
    });
    expect(tripListQuerySchema.safeParse({ from: '2026-10-22', to: '2026-10-21' }).success).toBe(
      false,
    );
  });

  it('explains why a trip is closed for sale', () => {
    expect(
      saleStatusSchema.parse({ tripId: crypto.randomUUID(), open: false, reason: 'DEPARTED' }),
    ).toMatchObject({ open: false, reason: 'DEPARTED' });
  });
});
