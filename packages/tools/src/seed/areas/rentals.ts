import type { SeedArea } from '../areas';
import { Tally } from '../report';

// Owned by the sales and clients team: nothing to seed here yet.
export const rentalsArea: SeedArea = {
  name: 'rentals',
  owner: 'roberto',
  run: async () => new Tally('rentals').report(),
};
