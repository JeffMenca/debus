import { render, screen } from '@testing-library/react';
import { act } from 'react';
import { clearSession, setSession } from '@/lib/auth/session-store';
import ExpensesPage, { metadata } from './page';

const replace = jest.fn();
jest.mock('../../../components/expenses/repair-expenses-screen', () => ({
  RepairExpensesScreen: () => <p>lista de gastos</p>,
}));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/sucursal/gastos',
}));

const signIn = (role: 'BRANCH_ADMIN' | 'CASHIER') =>
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
beforeEach(() => replace.mockReset());
afterEach(() => act(() => clearSession()));

it('shows the expenses to the branch admin', () => {
  signIn('BRANCH_ADMIN');
  render(<ExpensesPage />);

  expect(screen.getByText('lista de gastos')).toBeInTheDocument();
  expect(metadata.title).toBe('Gastos de taller · debus');
});

it('sends a cashier back to their own home', () => {
  signIn('CASHIER');
  render(<ExpensesPage />);

  expect(screen.queryByText('lista de gastos')).not.toBeInTheDocument();
  expect(replace).toHaveBeenCalledWith('/sucursal');
});
