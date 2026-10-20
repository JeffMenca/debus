import type { SeedContext } from './context';
import type { SeedReport } from './report';
import { clientsArea } from './areas/clients';
import { rentalsArea } from './areas/rentals';
import { salesArea } from './areas/sales';
import { runAccounts } from './stages/accounts';
import { runFleet } from './stages/fleet';
import { runOperations } from './stages/operations';
import { runStructure } from './stages/structure';

export interface SeedArea {
  name: string;
  owner: 'jeffrey' | 'roberto';
  run(ctx: SeedContext): Promise<SeedReport>;
}

const area = (name: string, run: SeedArea['run']): SeedArea => ({ name, owner: 'jeffrey', run });
const accounts = area('accounts', runAccounts);

// The order matters: the structure comes first, then the accounts of the staff (the fleet and the
// trips are done as the branch administrators), and the accounts again at the end, because the
// driver accounts only exist once the fleet registered the drivers.
export const SEED_AREAS: readonly SeedArea[] = [
  area('structure', runStructure),
  accounts,
  area('fleet', runFleet),
  area('operations', runOperations),
  clientsArea,
  salesArea,
  rentalsArea,
  accounts,
];
