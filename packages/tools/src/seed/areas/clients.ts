import type { SeedArea } from '../areas';
import { SEED_CLIENTS } from '../clients-catalog';
import type { SeedContext } from '../context';
import { Tally } from '../report';
import { clientSession } from './client-accounts';
import { ensureInitialTopUps } from './client-wallet';

// The people who buy online: their accounts and the money they put in their wallets over the past
// weeks. Sales and rentals count on these, and run them again when they run alone.
async function runClients(ctx: SeedContext) {
  const tally = new Tally('clients');
  for (const client of SEED_CLIENTS) {
    let activated = false;
    const session = await clientSession(ctx, client, () => {
      activated = true;
    });
    if (activated) tally.created('accounts');
    else tally.existing('accounts');
    const { created, existing } = await ensureInitialTopUps(ctx, client, session);
    tally.created('top-ups', created);
    tally.existing('top-ups', existing);
  }
  return tally.report();
}

export const clientsArea: SeedArea = { name: 'clients', owner: 'roberto', run: runClients };
