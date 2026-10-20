import { createdIn } from './report';
import { runSeed } from './run-seed';
import { setup } from './testing/setup';

describe('the whole seed against the API stand-in', () => {
  it('builds the demo company and, run again the same day, changes nothing', async () => {
    const { gateway, ctx } = setup();
    const options = { target: 'local', daysAhead: 7 } as const;

    const first = await runSeed(options, { ctx });
    expect(first.map((report) => report.area)).toEqual([
      'structure',
      'accounts',
      'fleet',
      'operations',
      'clients',
      'sales',
      'rentals',
      'accounts',
    ]);
    expect(gateway.branches).toHaveLength(6);
    expect(gateway.buses).toHaveLength(18);
    expect(gateway.trips.filter((trip) => trip.status === 'COMPLETED')).toHaveLength(18);
    // Every account of the seed can sign in, drivers included, since the accounts run last again.
    expect(first.at(-1)?.counts.drivers).toEqual({ created: 18, existing: 0 });

    const second = await runSeed(options, { ctx });
    expect(second.map(createdIn)).toEqual(second.map(() => 0));
  });
});
