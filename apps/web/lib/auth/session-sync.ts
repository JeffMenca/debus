import { type WebSession, webSessionSchema } from '@debus/contracts';
import { z } from 'zod';

const CHANNEL_NAME = 'debus-session';
const REFRESH_LOCK = 'debus-session-refresh';

const messageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('session'), session: webSessionSchema }),
  z.object({ type: z.literal('signed-out') }),
]);
type Message = z.infer<typeof messageSchema>;

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

export function listenToOtherTabs(
  onSession: (session: WebSession) => void,
  onSignOut: () => void,
): () => void {
  const shared = sharedChannel();
  if (!shared) return () => undefined;
  const onMessage = (event: MessageEvent<unknown>) => {
    const message = messageSchema.safeParse(event.data);
    if (!message.success) return;
    if (message.data.type === 'session') onSession(message.data.session);
    else onSignOut();
  };
  shared.addEventListener('message', onMessage);
  return () => shared.removeEventListener('message', onMessage);
}
