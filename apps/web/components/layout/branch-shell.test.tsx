import { render, screen } from '@testing-library/react';
import { act } from 'react';
import { useBranch } from '@/hooks/use-branches';
import { clearSession, setSession } from '@/lib/auth/session-store';
import { BranchShell } from './branch-shell';

jest.mock('../../hooks/use-branches');
jest.mock('next/navigation', () => ({
  usePathname: () => '/sucursal',
  useRouter: () => ({ replace: jest.fn() }),
}));

const branchId = '9b2c7a10-1111-4c4c-8888-123456789abc';

beforeEach(() =>
  act(() =>
    setSession({
      accessToken: 'a',
      accessExpiresIn: 900,
      user: {
        id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
        fullName: 'Marta Ruiz',
        email: 'm@b.com',
        role: 'CASHIER',
        branchId,
      },
    }),
  ),
);
afterEach(() => act(() => clearSession()));

it('names the branch of the person in the sidebar once it is loaded', () => {
  jest.mocked(useBranch).mockReturnValue({ data: { name: 'Quetzaltenango' } } as never);
  render(
    <BranchShell>
      <p>pagina</p>
    </BranchShell>,
  );

  expect(useBranch).toHaveBeenCalledWith(branchId);
  expect(screen.getByText('Sucursal')).toBeInTheDocument();
  expect(screen.getByText('Quetzaltenango')).toBeInTheDocument();
  expect(screen.getByText('pagina')).toBeInTheDocument();
});

it('shows no branch card while it loads', () => {
  jest.mocked(useBranch).mockReturnValue({ data: undefined } as never);
  render(
    <BranchShell>
      <p>pagina</p>
    </BranchShell>,
  );

  expect(screen.queryByText('Sucursal')).not.toBeInTheDocument();
  expect(screen.getByText('pagina')).toBeInTheDocument();
});
