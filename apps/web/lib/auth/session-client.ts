import { type WebSession, webSessionSchema } from '@debus/contracts';
import { ApiError, FRIENDLY_NETWORK_MESSAGE, apiErrorFrom } from '@/lib/api/api-error';
import {
  announceSession,
  announceSignOut,
  listenToOtherTabs,
  withRefreshLock,
} from './session-sync';
import { clearSession, getSession, markUnavailable, setSession } from './session-store';

let pending: Promise<WebSession | null> | null = null;
// Counts sessions adopted from other tabs, so a waiting refresh can tell one arrived.
let adopted = 0;

// Keeps this tab in step with the others: it takes over their new sessions and signs out with them.
export function startTabSync(): () => void {
  return listenToOtherTabs((session) => {
    adopted += 1;
    setSession(session);
  }, clearSession);
}

async function post(path: string, body?: unknown): Promise<Response> {
  try {
    return await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(0, FRIENDLY_NETWORK_MESSAGE);
  }
}

export async function signIn(email: string, password: string): Promise<WebSession> {
  const response = await post('/api/session/login', { email, password });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw apiErrorFrom(response.status, body);
  const session = webSessionSchema.parse(body);
  setSession(session);
  announceSession(session);
  return session;
}

// Simultaneous callers share one request: the refresh token rotates, so a second one would fail.
// Across tabs the lock keeps refreshes in turn; a tab that waited adopts what the winner sent.
export function refreshSession(): Promise<WebSession | null> {
  pending ??= (async () => {
    const adoptedBefore = adopted;
    try {
      return await withRefreshLock(async () => {
        const current = getSession();
        if (adopted !== adoptedBefore && current) return current;
        const response = await post('/api/session/refresh');
        // 204: nobody is signed in. 401: the cookie was refused. Either way the session is over.
        if (response.status === 204 || response.status === 401) {
          clearSession();
          return null;
        }
        if (!response.ok) {
          markUnavailable();
          return null;
        }
        const session = webSessionSchema.parse(await response.json());
        setSession(session);
        announceSession(session);
        return session;
      });
    } catch {
      // The server could not be reached or answered nonsense; that does not end the session.
      markUnavailable();
      return null;
    } finally {
      pending = null;
    }
  })();
  return pending;
}

export async function signOut(): Promise<void> {
  await post('/api/session/logout').catch(() => undefined);
  clearSession();
  announceSignOut();
}
