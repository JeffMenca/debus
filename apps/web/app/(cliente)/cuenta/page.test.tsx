import { render, screen } from '@testing-library/react';
import { act } from 'react';
import { clearSession, setSession } from '@/lib/auth/session-store';
import ClientLayout from '../layout';
import AccountPage, { metadata } from './page';

const replace = jest.fn();
jest.mock('../../../components/account/account-screen', () => ({
  AccountScreen: () => <p>mi cuenta</p>,
}));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/cuenta',
}));

const signIn = (role: 'CLIENT' | 'CASHIER') =>
  act(() =>
    setSession({
      accessToken: 'a',
      accessExpiresIn: 900,
      user: {
        id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
        fullName: 'Ana Méndez',
        email: 'a@b.com',
        role,
        branchId: null,
      },
    }),
  );
const renderPage = () =>
  render(
    <ClientLayout>
      <AccountPage />
    </ClientLayout>,
  );
beforeEach(() => replace.mockReset());
afterEach(() => act(() => clearSession()));

it('shows the account of a client inside the client shell', () => {
  signIn('CLIENT');
  renderPage();

  expect(metadata.title).toBe('Mi cuenta · debus');
  expect(screen.getByRole('main')).toContainElement(screen.getByText('mi cuenta'));
});

it('sends staff to their own home', () => {
  signIn('CASHIER');
  renderPage();

  expect(screen.queryByText('mi cuenta')).not.toBeInTheDocument();
  expect(replace).toHaveBeenCalledWith('/sucursal');
});
