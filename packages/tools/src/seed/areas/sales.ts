import type { SeedArea } from '../areas';
import { Tally } from '../report';

// Owned by the sales and clients team: nothing to seed here yet.
export const salesArea: SeedArea = {
  name: 'sales',
  owner: 'roberto',
  run: async () => new Tally('sales').report(),
};
