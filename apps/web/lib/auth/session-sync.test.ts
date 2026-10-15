import {
  FakeLocks,
  installFakeBroadcastChannel,
  installFakeLocks,
  otherTab,
} from '@/test-support/fake-tabs';
import {
  announceSession,
  announceSignOut,
  listenToOtherTabs,
  withRefreshLock,
} from './session-sync';

const session = {
  accessToken: 'a',
  accessExpiresIn: 900,
  user: {
    id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    fullName: 'Ana',
    email: 'a@b.com',
    role: 'CLIENT' as const,
    branchId: null,
  },
};
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('withRefreshLock', () => {
  let locks: FakeLocks;
  let restore: () => void;
  beforeEach(() => ({ locks, restore } = installFakeLocks()));
  afterEach(() => restore());

  it('runs the task under the shared lock and returns its result', async () => {
    await expect(withRefreshLock(async () => 'done')).resolves.toBe('done');
    expect(locks.requested).toEqual(['debus-session-refresh']);
  });

  it('makes a second caller wait for the first one to finish', async () => {
    const order: string[] = [];
    let finishFirst!: () => void;
    const first = withRefreshLock(async () => {
      order.push('first starts');
      await new Promise<void>((resolve) => (finishFirst = resolve));
      order.push('first ends');
    });
    const second = withRefreshLock(async () => void order.push('second starts'));

    await tick();
    expect(order).toEqual(['first starts']);
    finishFirst();
    await Promise.all([first, second]);

    expect(order).toEqual(['first starts', 'first ends', 'second starts']);
  });
});

describe('withRefreshLock without the Web Locks API', () => {
  it('just runs the task', async () => {
    await expect(withRefreshLock(async () => 'direct')).resolves.toBe('direct');
  });
});

describe('talking to other tabs', () => {
  let restore: () => void;
  beforeEach(() => (restore = installFakeBroadcastChannel()));
  afterEach(() => restore());

  it('delivers a session announced by another tab', async () => {
    const onSession = jest.fn();
    const stop = listenToOtherTabs(onSession, jest.fn());
    const other = otherTab();

    other.post({ type: 'session', session });
    await tick();

    expect(onSession).toHaveBeenCalledWith(session);
    stop();
    other.close();
  });

  it('delivers a sign-out announced by another tab', async () => {
    const onSignOut = jest.fn();
    const stop = listenToOtherTabs(jest.fn(), onSignOut);
    const other = otherTab();

    other.post({ type: 'signed-out' });
    await tick();

    expect(onSignOut).toHaveBeenCalledTimes(1);
    stop();
    other.close();
  });

  it('ignores messages that are not a session or a sign-out', async () => {
    const onSession = jest.fn();
    const onSignOut = jest.fn();
    const stop = listenToOtherTabs(onSession, onSignOut);
    const other = otherTab();

    other.post({ type: 'session', session: { accessToken: 'only-a-token' } });
    other.post('hello');
    await tick();

    expect(onSession).not.toHaveBeenCalled();
    expect(onSignOut).not.toHaveBeenCalled();
    stop();
    other.close();
  });

  it('applies what another tab announced in the order it announced it, even when the session takes longer to read', async () => {
    const order: string[] = [];
    const stop = listenToOtherTabs(
      () => order.push('session'),
      () => order.push('signed-out'),
    );
    const other = otherTab();

    other.post({ type: 'session', session });
    other.post({ type: 'signed-out' });
    other.post({ type: 'session', session });
    await tick();
    await tick();

    expect(order).toEqual(['session', 'signed-out', 'session']);
    stop();
    other.close();
  });

  it('keeps going after a message that cannot be read', async () => {
    const onSession = jest.fn();
    const stop = listenToOtherTabs(onSession, jest.fn());
    const other = otherTab();

    other.post({ type: 'session', session: { accessToken: 'only-a-token' } });
    other.post({ type: 'session', session });
    await tick();
    await tick();

    expect(onSession).toHaveBeenCalledTimes(1);
    stop();
    other.close();
  });

  it('stops listening once cleaned up', async () => {
    const onSignOut = jest.fn();
    const stop = listenToOtherTabs(jest.fn(), onSignOut);
    const other = otherTab();

    stop();
    other.post({ type: 'signed-out' });
    await tick();

    expect(onSignOut).not.toHaveBeenCalled();
    other.close();
  });

  it('announces to the other tabs but not to itself', async () => {
    const own = jest.fn();
    const stop = listenToOtherTabs(own, own);
    const received: unknown[] = [];
    const watcher = new BroadcastChannel('debus-session');
    watcher.addEventListener('message', (event) => received.push((event as MessageEvent).data));

    announceSession(session);
    announceSignOut();
    await tick();

    expect(received).toEqual([{ type: 'session', session }, { type: 'signed-out' }]);
    expect(own).not.toHaveBeenCalled();
    stop();
    watcher.close();
  });
});

describe('talking to other tabs without BroadcastChannel', () => {
  it('does nothing and does not fail', () => {
    expect(() => announceSession(session)).not.toThrow();
    expect(() => announceSignOut()).not.toThrow();
    expect(() => listenToOtherTabs(jest.fn(), jest.fn())()).not.toThrow();
  });
});
