import { act, renderHook } from '@testing-library/react';
import { clearSession, markUnavailable, setSession } from '@/lib/auth/session-store';
import { useAudience } from './use-audience';

const session = (role: 'CLIENT' | 'BRANCH_ADMIN') => ({
  accessToken: 'a',
  accessExpiresIn: 900,
  user: {
    id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    fullName: 'Ana López',
    email: 'ana@correo.com',
    role,
    branchId: null,
  },
});

describe('useAudience', () => {
  // The store keeps its state for the whole file, so this one has to run first.
  it('says "checking" until the first session check ends', () => {
    expect(renderHook(() => useAudience()).result.current).toBe('checking');
  });

  it('says "visitor" once the check ended without a session', () => {
    act(() => clearSession());

    expect(renderHook(() => useAudience()).result.current).toBe('visitor');
  });

  it('gives the role of whoever is signed in', () => {
    act(() => setSession(session('BRANCH_ADMIN')));
    const { result } = renderHook(() => useAudience());

    expect(result.current).toBe('BRANCH_ADMIN');
    act(() => setSession(session('CLIENT')));
    expect(result.current).toBe('CLIENT');
    act(() => clearSession());
  });

  it('treats an unreachable service like a visitor, as the header does', () => {
    act(() => clearSession());
    act(() => markUnavailable());

    expect(renderHook(() => useAudience()).result.current).toBe('visitor');
    act(() => clearSession());
  });
});
