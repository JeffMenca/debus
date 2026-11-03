import { GatewayError, isUnauthorized, type Gateway, type Session } from './gateway-client';
import type { Mailbox } from './mailbox';

export const LINK_PATH = '/(?:crear-contrasena|restablecer)';
export const AUTH_API = '/api/administracion/auth';

// An invitation lasts 48 hours, so one already in the mailbox is the first thing to try.
const LINK_WINDOW_MS = 48 * 60 * 60 * 1000;

// The link was used (409), expired (410) or is not known (400).
const isDeadLink = (error: unknown): boolean =>
  error instanceof GatewayError && [400, 409, 410].includes(error.status);

export function tokenOf(link: string): string {
  const token = new URL(link, 'http://seed.local').searchParams.get('token');
  if (!token) throw new Error('The emailed link has no token');
  return token;
}

// Signs in as a person would. An account without a password (just invited, or the bootstrap admin)
// takes the link it already received, or asks for a new one, and sets the password with it. A new
// link replaces the older ones and each account may ask for only a few per hour, so asking is the
// last resort.
export async function ensureSignedIn(
  client: Gateway,
  mailbox: Mailbox,
  email: string,
  password: string,
  onActivation?: () => void,
): Promise<Session> {
  try {
    return await client.login(email, password);
  } catch (error) {
    if (!isUnauthorized(error)) throw error;
  }
  const setPassword = (link: string) =>
    client.request(null, 'POST', `${AUTH_API}/password`, { token: tokenOf(link), password });
  const received = await mailbox.links(email, LINK_PATH, new Date(Date.now() - LINK_WINDOW_MS));
  let activated = false;
  for (const link of received) {
    try {
      await setPassword(link);
      activated = true;
      break;
    } catch (error) {
      if (!isDeadLink(error)) throw error;
    }
  }
  if (!activated) {
    const since = new Date();
    await client.request(null, 'POST', `${AUTH_API}/password/forgot`, { email });
    await setPassword(await mailbox.latestLink(email, LINK_PATH, since));
  }
  onActivation?.();
  return client.login(email, password);
}
