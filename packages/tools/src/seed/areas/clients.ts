import type { SeedArea } from '../areas';
import { Tally } from '../report';

// Owned by the sales and clients team: nothing to seed here yet.
export const clientsArea: SeedArea = {
  name: 'clients',
  owner: 'roberto',
  run: async () => new Tally('clients').report(),
};
