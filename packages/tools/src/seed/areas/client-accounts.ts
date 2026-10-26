import { AUTH_API, LINK_PATH, tokenOf } from '../accounts';
import { clientEmail, type SeedClient } from '../clients-catalog';
import type { SeedContext } from '../context';
import { isUnauthorized, type Session } from '../gateway-client';

// A client signs up on the public form, so the seed does the same: the activation link comes with
// the signup, and the password is set through it. Whoever asks again gets the same session.
export async function clientSession(
  ctx: SeedContext,
  client: SeedClient,
  onActivation?: () => void,
): Promise<Session> {
  const known = ctx.clientSessions.get(client.number);
  if (known) return known;
  const email = clientEmail(ctx.emailBase, client.number);
  const session = await signIn(ctx, client, email, onActivation);
  ctx.clientSessions.set(client.number, session);
  return session;
}

async function signIn(
  ctx: SeedContext,
  client: SeedClient,
  email: string,
  onActivation?: () => void,
): Promise<Session> {
  try {
    return await ctx.client.login(email, ctx.password);
  } catch (error) {
    if (!isUnauthorized(error)) throw error;
  }
  const since = new Date();
  await ctx.client.request(null, 'POST', `${AUTH_API}/signup`, {
    fullName: client.fullName,
    email,
    dpi: client.dpi,
    phone: client.phone,
    nit: client.nit,
    address: client.address,
  });
  const link = await linkFor(ctx, email, since);
  await ctx.client.request(null, 'POST', `${AUTH_API}/password`, {
    token: tokenOf(link),
    password: ctx.password,
  });
  onActivation?.();
  ctx.log(`Activated ${email}`);
  return ctx.client.login(email, ctx.password);
}

// A signup of a new account emails the activation link. An account that already works with another
// password gets no link from the signup, so the reset link is asked for before giving up.
async function linkFor(ctx: SeedContext, email: string, since: Date): Promise<string> {
  try {
    return await ctx.mailbox.latestLink(email, LINK_PATH, since);
  } catch {
    const asked = new Date();
    await ctx.client.request(null, 'POST', `${AUTH_API}/password/forgot`, { email });
    try {
      return await ctx.mailbox.latestLink(email, LINK_PATH, asked);
    } catch (error) {
      throw new Error(
        `No link reached ${email}: the account may already exist with another password`,
        { cause: error },
      );
    }
  }
}
