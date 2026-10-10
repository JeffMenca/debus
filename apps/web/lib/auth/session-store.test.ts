import { act, renderHook } from '@testing-library/react';
import {
  clearSession,
  getSessionStatus,
  markUnavailable,
  getSession,
  setSession,
  useSession,
  useSessionStatus,
} from './session-store';

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

describe('session store', () => {
  afterEach(() => clearSession());

  it('keeps the session only in memory and notifies subscribers', () => {
    const { result } = renderHook(() => useSession());
    expect(result.current).toBeNull();

    act(() => setSession(session));

    expect(result.current?.user.fullName).toBe('Ana');
    expect(getSession()?.accessToken).toBe('a');
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('forgets the session and reports that restoring is over', () => {
    const { result } = renderHook(() => ({ session: useSession(), status: useSessionStatus() }));
    act(() => setSession(session));

    act(() => clearSession());

    expect(result.current.session).toBeNull();
    expect(result.current.status).toBe('ready');
  });

  it('reports an outage without touching the session, until something succeeds', () => {
    const { result } = renderHook(() => ({ session: useSession(), status: useSessionStatus() }));
    act(() => setSession(session));

    act(() => markUnavailable());

    expect(result.current.status).toBe('unavailable');
    expect(result.current.session?.accessToken).toBe('a');
    expect(getSessionStatus()).toBe('unavailable');

    act(() => setSession(session));
    expect(result.current.status).toBe('ready');
  });
});
