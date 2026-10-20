import { Tally, createdIn, formatReport } from './report';

describe('Tally', () => {
  it('counts what was created and what already existed per kind', () => {
    const tally = new Tally('fleet');
    tally.created('buses');
    tally.created('buses', 2);
    tally.existing('buses');
    tally.existing('drivers', 4);
    tally.skipped('trips');
    tally.skipped('trips', 2);
    tally.removed('old trips', 4);
    expect(tally.report()).toEqual({
      area: 'fleet',
      counts: {
        buses: { created: 3, existing: 1 },
        drivers: { created: 0, existing: 4 },
        trips: { created: 0, existing: 0, skipped: 3 },
        'old trips': { created: 0, existing: 0, removed: 4 },
      },
    });
  });

  it('adds up what an area created', () => {
    const tally = new Tally('fleet');
    tally.created('buses', 2);
    tally.created('drivers');
    tally.existing('routes', 9);
    expect(createdIn(tally.report())).toBe(3);
  });
});

describe('formatReport', () => {
  it('prints one block per area', () => {
    const fleet = new Tally('fleet');
    fleet.created('buses', 2);
    fleet.existing('buses');
    fleet.skipped('trips');
    fleet.removed('old trips', 2);
    expect(formatReport([fleet.report(), new Tally('clients').report()])).toBe(
      [
        'fleet',
        '  buses: 2 created, 1 already there',
        '  trips: 0 created, 0 already there, 1 skipped',
        '  old trips: 0 created, 0 already there, 2 removed',
        'clients',
        '  nothing to do',
      ].join('\n'),
    );
  });
});
