import { FRIENDLY_NETWORK_MESSAGE } from '@/lib/api/api-error';
import { installFakeBroadcastChannel, installFakeLocks, otherTab } from '@/test-support/fake-tabs';
import { refreshSession, signIn, signOut, startTabSync } from './session-client';
import { clearSession, getSession, getSessionStatus, setSession } from './session-store';

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
const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  clearSession();
});

describe('session client', () => {
  it('signs in through the web session route', async () => {
    fetchMock.mockResolvedValue(Response.json(session));

    await signIn('a@b.com', 'clave');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/session/login',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(getSession()?.accessToken).toBe('a');
  });

  it('surfaces the gateway message on failure', async () => {
    fetchMock.mockResolvedValue(
      Response.json(
        {
          statusCode: 423,
          error: 'Locked',
          message: 'Por seguridad bloqueamos tu cuenta 15 minutos.',
        },
        { status: 423 },
      ),
    );

    await expect(signIn('a@b.com', 'x')).rejects.toMatchObject({
      status: 423,
      message: 'Por seguridad bloqueamos tu cuenta 15 minutos.',
    });
  });

  it('shows the locked-account message from the real 423 body, which has no error field', async () => {
    fetchMock.mockResolvedValue(
      Response.json(
        {
          statusCode: 423,
          message:
            'Por seguridad bloqueamos tu cuenta 15 minutos. Intenta más tarde o restablece tu contraseña.',
        },
        { status: 423 },
      ),
    );

    await expect(signIn('a@b.com', 'x')).rejects.toMatchObject({
      status: 423,
      message:
        'Por seguridad bloqueamos tu cuenta 15 minutos. Intenta más tarde o restablece tu contraseña.',
    });
  });

  it('uses a friendly message when the failure has no usable body', async () => {
    fetchMock.mockResolvedValue(new Response('<html>', { status: 500 }));

    await expect(signIn('a@b.com', 'x')).rejects.toMatchObject({
      status: 500,
      message: FRIENDLY_NETWORK_MESSAGE,
    });
  });

  it('uses a friendly message when the network fails', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(signIn('a@b.com', 'x')).rejects.toMatchObject({
      status: 0,
      message: FRIENDLY_NETWORK_MESSAGE,
    });
  });

  it('shares one refresh between simultaneous callers', async () => {
    fetchMock.mockResolvedValue(Response.json(session));

    const [first, second] = await Promise.all([refreshSession(), refreshSession()]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
    expect(getSession()?.user.fullName).toBe('Ana');
  });

  it('returns null when the session ended', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));

    expect(await refreshSession()).toBeNull();
    expect(getSession()).toBeNull();
  });

  it('treats 204 as "nobody signed in" without calling it a failure', async () => {
    setSession(session as never);
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    expect(await refreshSession()).toBeNull();
    expect(getSession()).toBeNull();
    expect(getSessionStatus()).toBe('ready');
  });

  it('keeps the session and reports the service as unavailable when the network fails', async () => {
    setSession(session as never);
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    expect(await refreshSession()).toBeNull();
    expect(getSession()?.accessToken).toBe('a');
    expect(getSessionStatus()).toBe('unavailable');
  });

  it('keeps the session when the gateway answers with a server error', async () => {
    setSession(session as never);
    fetchMock.mockResolvedValue(Response.json({ message: 'x' }, { status: 503 }));

    await refreshSession();

    expect(getSession()?.accessToken).toBe('a');
    expect(getSessionStatus()).toBe('unavailable');
  });

  it('recovers from an outage on the next successful refresh', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await refreshSession();
    fetchMock.mockResolvedValueOnce(Response.json(session));

    await refreshSession();

    expect(getSessionStatus()).toBe('ready');
    expect(getSession()?.accessToken).toBe('a');
  });

  it('signs out and forgets the session', async () => {
    fetchMock
      .mockResolvedValueOnce(Response.json(session))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    await signIn('a@b.com', 'clave');

    await signOut();

    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/session/logout',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(getSession()).toBeNull();
  });

  it('forgets the session even when the server cannot be reached', async () => {
    fetchMock
      .mockResolvedValueOnce(Response.json(session))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await signIn('a@b.com', 'clave');

    await signOut();

    expect(getSession()).toBeNull();
  });
});

describe('session client across tabs', () => {
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
  const received: unknown[] = [];
  let restoreChannel: () => void;
  let restoreLocks: () => void;
  let locks: ReturnType<typeof installFakeLocks>['locks'];
  let watcher: BroadcastChannel;

  beforeEach(() => {
    received.length = 0;
    restoreChannel = installFakeBroadcastChannel();
    ({ locks, restore: restoreLocks } = installFakeLocks());
    watcher = new BroadcastChannel('debus-session');
    watcher.addEventListener('message', (event) => received.push((event as MessageEvent).data));
  });
  afterEach(() => {
    watcher.close();
    restoreLocks();
    restoreChannel();
  });

  it('refreshes under the shared lock, after whoever holds it', async () => {
    fetchMock.mockResolvedValue(Response.json(session));
    let release!: () => void;
    void locks.request(
      'debus-session-refresh',
      () => new Promise<void>((resolve) => (release = resolve)),
    );

    const refreshing = refreshSession();
    await tick();
    expect(fetchMock).not.toHaveBeenCalled();

    release();
    await refreshing;

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('still shares one request between callers in the same tab', async () => {
    fetchMock.mockResolvedValue(Response.json(session));

    await Promise.all([refreshSession(), refreshSession()]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(locks.requested).toHaveLength(1);
  });

  it('adopts the session another tab refreshed while it was waiting', async () => {
    const stop = startTabSync();
    const other = otherTab();
    let release!: () => void;
    void locks.request(
      'debus-session-refresh',
      () => new Promise<void>((resolve) => (release = resolve)),
    );

    const refreshing = refreshSession();
    await tick();
    other.post({ type: 'session', session: { ...session, accessToken: 'from-other-tab' } });
    await tick();
    release();

    expect((await refreshing)?.accessToken).toBe('from-other-tab');
    expect(fetchMock).not.toHaveBeenCalled();
    stop();
    other.close();
  });

  it('refreshes by itself when no other tab did', async () => {
    const stop = startTabSync();
    fetchMock.mockResolvedValue(Response.json(session));

    expect((await refreshSession())?.accessToken).toBe('a');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    stop();
  });

  it('tells the other tabs about a new session', async () => {
    fetchMock.mockResolvedValueOnce(Response.json(session));
    await signIn('a@b.com', 'clave');
    fetchMock.mockResolvedValueOnce(Response.json({ ...session, accessToken: 'renewed' }));
    await refreshSession();
    await tick();

    expect(received).toEqual([
      { type: 'session', session },
      { type: 'session', session: { ...session, accessToken: 'renewed' } },
    ]);
  });

  it('does not tell the other tabs when a refresh fails', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));

    await refreshSession();
    await tick();

    expect(received).toEqual([]);
  });

  it('tells the other tabs about a sign-out', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await signOut();
    await tick();

    expect(received).toEqual([{ type: 'signed-out' }]);
  });

  it('adopts sessions and sign-outs announced by other tabs', async () => {
    const stop = startTabSync();
    const other = otherTab();

    other.post({ type: 'session', session });
    await tick();
    expect(getSession()?.accessToken).toBe('a');

    other.post({ type: 'signed-out' });
    await tick();
    expect(getSession()).toBeNull();

    // Only the two messages the other tab posted: what this tab adopts is not announced again,
    // or tabs would echo each other forever.
    expect(received).toEqual([{ type: 'session', session }, { type: 'signed-out' }]);
    stop();
    other.close();
  });

  it('stops adopting once the tab sync is stopped', async () => {
    setSession(session);
    const stop = startTabSync();
    const other = otherTab();

    stop();
    other.post({ type: 'signed-out' });
    await tick();

    expect(getSession()).not.toBeNull();
    other.close();
  });
});
