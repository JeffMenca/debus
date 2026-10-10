import { closeSessionChannel } from '@/lib/auth/session-sync';

// In-memory stand-ins for the browser APIs that connect tabs, which jsdom does not provide.

type Listener = (event: { data: unknown }) => void;

const openChannels = new Map<string, Set<FakeBroadcastChannel>>();

class FakeBroadcastChannel {
  private readonly listeners = new Set<Listener>();

  constructor(readonly name: string) {
    openChannels.set(name, (openChannels.get(name) ?? new Set()).add(this));
  }

  // Like the real one, the sender never hears itself; delivery is asynchronous.
  postMessage(data: unknown): void {
    // A real channel copies the data; JSON is enough for the plain objects used here.
    const copy: unknown = JSON.parse(JSON.stringify(data));
    for (const peer of openChannels.get(this.name) ?? []) {
      if (peer !== this)
        peer.listeners.forEach((listener) => queueMicrotask(() => listener({ data: copy })));
    }
  }

  addEventListener(_type: 'message', listener: Listener): void {
    this.listeners.add(listener);
  }

  removeEventListener(_type: 'message', listener: Listener): void {
    this.listeners.delete(listener);
  }

  close(): void {
    openChannels.get(this.name)?.delete(this);
  }
}

export class FakeLocks {
  private readonly tails = new Map<string, Promise<unknown>>();
  readonly requested: string[] = [];

  // Exclusive and first come, first served, as in the Web Locks API.
  request<T>(name: string, task: () => Promise<T>): Promise<T> {
    this.requested.push(name);
    const run = (this.tails.get(name) ?? Promise.resolve()).then(task);
    this.tails.set(
      name,
      run.catch(() => undefined),
    );
    return run;
  }
}

export function installFakeBroadcastChannel(): () => void {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'BroadcastChannel');
  Object.defineProperty(globalThis, 'BroadcastChannel', {
    value: FakeBroadcastChannel,
    configurable: true,
    writable: true,
  });
  return () => {
    closeSessionChannel();
    openChannels.clear();
    if (original) Object.defineProperty(globalThis, 'BroadcastChannel', original);
    else Reflect.deleteProperty(globalThis, 'BroadcastChannel');
  };
}

export function installFakeLocks(): { locks: FakeLocks; restore: () => void } {
  const locks = new FakeLocks();
  Object.defineProperty(navigator, 'locks', { value: locks, configurable: true });
  return { locks, restore: () => Reflect.deleteProperty(navigator, 'locks') };
}

// What another tab would post, as seen by this one.
export function otherTab(name = 'debus-session') {
  const channel = new FakeBroadcastChannel(name);
  return { post: (data: unknown) => channel.postMessage(data), close: () => channel.close() };
}
