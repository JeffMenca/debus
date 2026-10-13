import { render, screen } from '@testing-library/react';
import { act } from 'react';
import { clearSession, setSession } from '@/lib/auth/session-store';
import { BranchHome } from './branch-home';

jest.mock('./branch-dashboard', () => ({ BranchDashboard: () => <p>panel de sucursal</p> }));

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
afterEach(() => act(() => clearSession()));

it('shows the panel to the branch admin', () => {
  signIn('BRANCH_ADMIN');
  render(<BranchHome />);

  expect(screen.getByText('panel de sucursal')).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Hola, Marta Ruiz' })).not.toBeInTheDocument();
});

it.each(['CASHIER', 'DRIVER'] as const)('keeps the welcome for the %s', (role) => {
  signIn(role);
  render(<BranchHome />);

  expect(screen.getByRole('heading', { name: 'Hola, Marta Ruiz' })).toBeInTheDocument();
  expect(screen.queryByText('panel de sucursal')).not.toBeInTheDocument();
});

it('shows nothing before the session is known', () => {
  const { container } = render(<BranchHome />);

  expect(container).toBeEmptyDOMElement();
});
