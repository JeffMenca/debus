import { isUnauthorized, type Gateway, type Session } from './gateway-client';
import type { Mailbox } from './mailbox';

const LINK_PATH = '/(?:crear-contrasena|restablecer)';
const API = '/api/administracion/auth';

function tokenOf(link: string): string {
  const token = new URL(link, 'http://seed.local').searchParams.get('token');
  if (!token) throw new Error('The emailed link has no token');
  return token;
}

// Signs in as a person would. An account without a password (just invited, or the bootstrap admin)
// asks for a link, reads it from the mailbox and sets the password with it.
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
  const since = new Date();
  await client.request(null, 'POST', `${API}/password/forgot`, { email });
  const link = await mailbox.latestLink(email, LINK_PATH, since);
  await client.request(null, 'POST', `${API}/password`, { token: tokenOf(link), password });
  onActivation?.();
  return client.login(email, password);
}
