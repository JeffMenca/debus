import { SEED_AREAS } from './areas';

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
});
