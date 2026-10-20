import { historyWhere, nextTripWhere } from './ticket-history';

const clientId = '2a1b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const now = new Date('2026-10-20T12:00:00.000Z');
const query = { page: 1, pageSize: 20 };

describe('historyWhere', () => {
  it('keeps the history to the tickets of the client', () => {
    expect(historyWhere(clientId, query)).toEqual({ clientId });
  });

  it('narrows the departure of the trip to whole Guatemalan days', () => {
    expect(historyWhere(clientId, { ...query, from: '2026-10-20', to: '2026-10-20' })).toEqual({
      clientId,
      trip: {
        departureAt: {
          gte: new Date('2026-10-20T06:00:00.000Z'),
          lt: new Date('2026-10-21T06:00:00.000Z'),
        },
      },
    });
  });

  it('searches the folded text of the trip with LIKE wildcards taken literally', () => {
    expect(historyWhere(clientId, { ...query, q: 'xela_' })).toEqual({
      clientId,
      trip: { searchText: { contains: 'xela\\_' } },
    });
  });
});

describe('nextTripWhere', () => {
  it('looks only at the trips of the client that have not left', () => {
    expect(nextTripWhere(clientId, now)).toEqual({ clientId, trip: { departureAt: { gt: now } } });
  });
});
