import { SEED_AREAS } from './areas';
import { clientsArea } from './areas/clients';
import { rentalsArea } from './areas/rentals';
import { salesArea } from './areas/sales';
import { setup } from './testing/setup';

describe('SEED_AREAS', () => {
  it('runs the structure first, the fleet before the operations and the driver accounts last', () => {
    expect(SEED_AREAS.map((area) => area.name)).toEqual([
      'structure',
      'accounts',
      'fleet',
      'operations',
      'clients',
      'sales',
      'rentals',
      'accounts',
    ]);
  });

  it('says whose each area is', () => {
    const owners = Object.fromEntries(SEED_AREAS.map((area) => [area.name, area.owner]));
    expect(owners).toEqual({
      structure: 'jeffrey',
      accounts: 'jeffrey',
      fleet: 'jeffrey',
      operations: 'jeffrey',
      clients: 'roberto',
      sales: 'roberto',
      rentals: 'roberto',
    });
  });

  it.each([clientsArea, salesArea, rentalsArea])(
    'the empty area $name does nothing',
    async (area) => {
      const { gateway, ctx } = setup();
      await expect(area.run(ctx)).resolves.toEqual({ area: area.name, counts: {} });
      expect(gateway.requests).toHaveLength(0);
    },
  );
});
