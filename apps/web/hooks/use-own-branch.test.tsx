import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { clearSession, setSession } from '@/lib/auth/session-store';
import { useBranch } from './use-branches';
import { useOwnBranch } from './use-own-branch';

jest.mock('./use-branches');

const session = (branchId: string | null) => ({
  accessToken: 'a',
  accessExpiresIn: 900,
  user: {
    id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    fullName: 'Luis Ramírez',
    email: 'l@b.com',
    role: 'BRANCH_ADMIN' as const,
    branchId,
  },
});

afterEach(() => act(() => clearSession()));

it('loads the branch of the session', () => {
  jest.mocked(useBranch).mockReturnValue({ data: { id: 'b1', name: 'Quetzaltenango' } } as never);
  act(() => setSession(session('b1')));

  const { result } = renderHook(() => useOwnBranch());

  expect(useBranch).toHaveBeenCalledWith('b1');
  expect(result.current).toEqual({ id: 'b1', name: 'Quetzaltenango' });
});

it('has no branch while the session has none', () => {
  jest.mocked(useBranch).mockReturnValue({ data: undefined } as never);
  act(() => setSession(session(null)));

  const { result } = renderHook(() => useOwnBranch());

  expect(useBranch).toHaveBeenLastCalledWith(null);
  expect(result.current).toBeUndefined();
});
