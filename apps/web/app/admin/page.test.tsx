import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { act } from 'react';
import { clearSession, setSession } from '@/lib/auth/session-store';
import AdminPage from './page';

jest.mock('../../hooks/use-branches', () => ({ useBranchCounts: () => ({ data: undefined }) }));
jest.mock('../../hooks/use-users', () => ({ useUserCounts: () => ({ data: undefined }) }));
jest.mock('../../hooks/use-settings', () => ({ useSettingsSummary: () => ({ data: undefined }) }));

afterEach(() => act(() => clearSession()));

it('greets the system administrator on the panel', () => {
  act(() =>
    setSession({
      accessToken: 'a',
      accessExpiresIn: 900,
      user: {
        id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
        fullName: 'Marta Ruiz',
        email: 'm@b.com',
        role: 'SYSTEM_ADMIN',
        branchId: null,
      },
    }),
  );
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AdminPage />
    </QueryClientProvider>,
  );

  expect(screen.getByRole('heading', { level: 1, name: 'Hola, Marta' })).toBeInTheDocument();
});
