import { render, screen } from '@testing-library/react';
import { act } from 'react';
import { clearSession, setSession } from '@/lib/auth/session-store';
import BranchPage from './page';

afterEach(() => act(() => clearSession()));

it.each(['BRANCH_ADMIN', 'CASHIER', 'DRIVER'] as const)('welcomes the %s', (role) => {
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
  render(<BranchPage />);

  expect(screen.getByRole('heading', { name: 'Hola, Marta Ruiz' })).toBeInTheDocument();
});
