import type { WebSession } from '@debus/contracts';

const CHANNEL_NAME = 'debus-session';
const REFRESH_LOCK = 'debus-session-refresh';

type Message = { type: 'session'; session: WebSession } | { type: 'signed-out' };

// Tabs of one browser share a single refresh cookie that rotates on every use. The lock makes
// them refresh one at a time, so each request carries the cookie the previous one rotated.
// Without the Web Locks API every tab refreshes on its own, as before.
export function withRefreshLock<T>(task: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  // request() resolves with whatever the task returns, here a promise; unwrap it for the types.
  return locks ? locks.request(REFRESH_LOCK, task).then((result) => result) : task();
}

// One channel for the page's lifetime: it never delivers a message back to the instance that
// sent it, so a tab does not hear its own announcements.
let channel: BroadcastChannel | null = null;

function sharedChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  channel ??= new BroadcastChannel(CHANNEL_NAME);
  return channel;
}

export function closeSessionChannel(): void {
  channel?.close();
  channel = null;
}

export const announceSession = (session: WebSession): void =>
  sharedChannel()?.postMessage({ type: 'session', session } satisfies Message);
export const announceSignOut = (): void =>
  sharedChannel()?.postMessage({ type: 'signed-out' } satisfies Message);

// The schema of a session comes with zod, which the first screen of the site does not carry: it is
// loaded when another tab announces a session, not before.
async function readSession(value: unknown): Promise<WebSession | null> {
  const { webSessionSchema } = await import('@debus/contracts');
  const parsed = webSessionSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function listenToOtherTabs(
  onSession: (session: WebSession) => void,
  onSignOut: () => void,
): () => void {
  const shared = sharedChannel();
  if (!shared) return () => undefined;
  let listening = true;
  // Reading a session can wait for the schema to load, a sign-out cannot: the messages are handled
  // one after the other so a late session never lands after the sign-out that followed it.
  let queue: Promise<void> = Promise.resolve();
  const handle = async (data: unknown): Promise<void> => {
    if (typeof data !== 'object' || data === null) return;
    const { type, session } = data as { type?: unknown; session?: unknown };
    if (type === 'signed-out') return listening ? onSignOut() : undefined;
    if (type !== 'session') return;
    const read = await readSession(session);
    if (read && listening) onSession(read);
  };
  const onMessage = (event: MessageEvent<unknown>) => {
    queue = queue.then(() => handle(event.data)).catch(() => undefined);
  };
  shared.addEventListener('message', onMessage);
  return () => {
    listening = false;
    shared.removeEventListener('message', onMessage);
  };
}
