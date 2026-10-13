import { saleStatusOf } from './sale-status-rules';

const now = new Date('2026-10-20T10:00:00Z');
const id = '4c3d2e1f-7a6b-4c5d-8e9f-0a1b2c3d4e5f';
const trip = {
  id,
  type: 'REGULAR' as const,
  status: 'SCHEDULED' as const,
  departureAt: new Date('2026-10-20T12:00:00Z'),
  ticketPrice: { toNumber: () => 85 },
  capacity: 40,
};

describe('saleStatusOf', () => {
  it('opens a future regular trip with its price and capacity', () => {
    expect(saleStatusOf(id, trip, now)).toEqual({
      tripId: id,
      open: true,
      ticketPrice: 85,
      capacity: 40,
      departureAt: '2026-10-20T12:00:00.000Z',
    });
  });

  it('closes what cannot be sold, and says why', () => {
    expect(saleStatusOf(id, null, now)).toEqual({ tripId: id, open: false, reason: 'NOT_FOUND' });
    expect(saleStatusOf(id, { ...trip, type: 'RENTAL' }, now)).toMatchObject({
      open: false,
      reason: 'NOT_REGULAR',
    });
    expect(saleStatusOf(id, { ...trip, status: 'IN_TRANSIT' }, now)).toMatchObject({
      open: false,
      reason: 'DEPARTED',
    });
    expect(saleStatusOf(id, { ...trip, status: 'COMPLETED' }, now)).toMatchObject({
      open: false,
      reason: 'DEPARTED',
    });
    expect(saleStatusOf(id, { ...trip, departureAt: now }, now)).toMatchObject({
      open: false,
      reason: 'DEPARTED',
    });
  });

  it('answers with no price when the trip has none', () => {
    expect(saleStatusOf(id, { ...trip, ticketPrice: null }, now)).toMatchObject({
      open: true,
      ticketPrice: null,
    });
  });
});
