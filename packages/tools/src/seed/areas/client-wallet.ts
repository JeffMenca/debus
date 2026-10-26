import { walletMovementPageSchema, walletSchema, type Wallet } from '@debus/contracts';
import { CLIENTES, IDEMPOTENCY_KEY, withQuery } from '../api';
import type { SeedClient } from '../clients-catalog';
import type { SeedContext } from '../context';
import { paidOnFor } from '../dates';
import type { Session } from '../gateway-client';
import { uuidFrom } from '../ids';
import { pendingCopy, untilRegistered } from '../retry';

const WALLET = `${CLIENTES}/wallet`;
const TOP_UP_STEP = 100;

// The wallet is created by an event after the account is activated.
const WALLET_PENDING = pendingCopy('Estamos preparando tu cuenta');

const inCents = (amount: number): number => Math.round(amount * 100);
const topUpKey = (email: string, index: number): string => uuidFrom(`topup:${email}:${index}`);

export const readWallet = (ctx: SeedContext, session: Session): Promise<Wallet> =>
  untilRegistered(() => ctx.client.request(session, 'GET', WALLET, undefined, walletSchema), {
    ...ctx.retry,
    isPending: WALLET_PENDING,
  });

// How many top-ups the wallet has had, which is also the number of the next one.
export async function topUpsMade(ctx: SeedContext, session: Session): Promise<number> {
  const movements = await untilRegistered(
    () =>
      ctx.client.request(
        session,
        'GET',
        withQuery(`${WALLET}/movements`, { kind: 'TOP_UP', page: 1, pageSize: 1 }),
        undefined,
        walletMovementPageSchema,
      ),
    { ...ctx.retry, isPending: WALLET_PENDING },
  );
  return movements.total;
}

// The key is the number of the top-up, so asking for the same one twice never credits twice.
async function topUp(
  ctx: SeedContext,
  session: Session,
  email: string,
  index: number,
  amount: number,
  paidOn: string,
): Promise<void> {
  await untilRegistered(
    () =>
      ctx.client.request(session, 'POST', `${WALLET}/top-ups`, { amount, paidOn }, walletSchema, {
        [IDEMPOTENCY_KEY]: topUpKey(email, index),
      }),
    { ...ctx.retry, isPending: WALLET_PENDING },
  );
}

// The top-ups a client made over the past weeks. Those already in the wallet are left alone, so a
// repeated run, or one that stopped halfway, ends in the same balance.
export async function ensureInitialTopUps(
  ctx: SeedContext,
  client: SeedClient,
  session: Session,
): Promise<{ created: number; existing: number }> {
  const email = session.user.email;
  const made = await topUpsMade(ctx, session);
  let created = 0;
  for (const [index, amount] of client.topUps.entries()) {
    if (index < made) continue;
    await topUp(ctx, session, email, index, amount, paidOnFor(ctx.today, topUpKey(email, index)));
    created++;
  }
  return { created, existing: Math.min(made, client.topUps.length) };
}

// Tops up, in whole hundreds and dated today, only what a purchase is short of.
// Returns whether it had to.
export async function ensureBalance(
  ctx: SeedContext,
  session: Session,
  email: string,
  needed: number,
): Promise<boolean> {
  const { balance } = await readWallet(ctx, session);
  const missing = inCents(needed) - inCents(balance);
  if (missing <= 0) return false;
  const amount = Math.ceil(missing / 100 / TOP_UP_STEP) * TOP_UP_STEP;
  await topUp(ctx, session, email, await topUpsMade(ctx, session), amount, ctx.today);
  return true;
}
