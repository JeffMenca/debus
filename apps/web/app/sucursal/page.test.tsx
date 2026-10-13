import { render, screen } from '@testing-library/react';
import { act } from 'react';
import { clearSession, setSession } from '@/lib/auth/session-store';
import BranchPage, { metadata } from './page';

jest.mock('../../components/branch/branch-dashboard', () => ({
  BranchDashboard: () => <p>panel de sucursal</p>,
}));

afterEach(() => act(() => clearSession()));

const signIn = (role: 'BRANCH_ADMIN' | 'CASHIER' | 'DRIVER') =>
  act(() =>
    setSession({
      accessToken: 'a',
      accessExpiresIn: 900,
      user: {
        id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
        fullName: 'Marta Ruiz',
        email: 'm@b.com',
        role,
        branchId: '8f9e6679-7425-40de-944b-e07fc1f90ae7',
      },
    }),
  );

it('shows the panel to the branch admin', () => {
  signIn('BRANCH_ADMIN');
  render(<BranchPage />);

  expect(screen.getByText('panel de sucursal')).toBeInTheDocument();
  expect(metadata.title).toBe('Sucursal · debus');
});

it.each(['CASHIER', 'DRIVER'] as const)('welcomes the %s', (role) => {
  signIn(role);
  render(<BranchPage />);

  expect(screen.getByRole('heading', { name: 'Hola, Marta Ruiz' })).toBeInTheDocument();
});
