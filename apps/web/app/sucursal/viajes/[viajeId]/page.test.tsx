import { render, screen } from '@testing-library/react';
import { act } from 'react';
import { clearSession, setSession } from '@/lib/auth/session-store';
import TripPage, { metadata } from './page';

const replace = jest.fn();
jest.mock('../../../../components/trips/trip-detail-screen', () => ({
  TripDetailScreen: ({ tripId, audience }: { tripId: string; audience: string }) => (
    <p>{`trip ${tripId} for ${audience}`}</p>
  ),
}));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/sucursal/viajes/abc',
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

it('reads the id from the address and shows that trip to the branch admin', async () => {
  signIn('BRANCH_ADMIN');
  render(await TripPage({ params: Promise.resolve({ viajeId: 'abc' }) } as never));

  expect(screen.getByText('trip abc for branch')).toBeInTheDocument();
  expect(metadata.title).toBe('Viaje · debus');
});

it('sends a cashier back to their own home', async () => {
  signIn('CASHIER');
  render(await TripPage({ params: Promise.resolve({ viajeId: 'abc' }) } as never));

  expect(screen.queryByText(/trip abc/)).not.toBeInTheDocument();
  expect(replace).toHaveBeenCalledWith('/sucursal');
});
