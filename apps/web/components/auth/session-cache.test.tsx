import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react';
import { clearSession, setSession } from '@/lib/auth/session-store';
import { SessionCache } from './session-cache';

const sessionOf = (id: string, branchId: string) => ({
  accessToken: 'a',
  accessExpiresIn: 900,
  user: { id, fullName: 'Ana', email: 'a@b.com', role: 'BRANCH_ADMIN' as const, branchId },
});
const ANA = sessionOf(
  '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  '9b2c7a10-1111-4c4c-8888-123456789abc',
);
const LUIS = sessionOf(
  '11111111-2222-4333-8444-555555555555',
  '5d1f3a20-2222-4d4d-9999-123456789abc',
);

function mount() {
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <SessionCache />
    </QueryClientProvider>,
  );
  return client;
}
const keep = (client: QueryClient) => client.setQueryData(['drivers'], ['of the first branch']);

afterEach(() => act(() => clearSession()));

describe('SessionCache', () => {
  it('forgets what one person loaded when they sign out', () => {
    act(() => setSession(ANA));
    const client = mount();
    keep(client);

    act(() => clearSession());

    expect(client.getQueryData(['drivers'])).toBeUndefined();
  });

  it('forgets it when another person takes the session, as another tab can do', () => {
    act(() => setSession(ANA));
    const client = mount();
    keep(client);

    act(() => setSession(LUIS));

    expect(client.getQueryData(['drivers'])).toBeUndefined();
  });

  it('keeps it while the same person renews the session', () => {
    act(() => setSession(ANA));
    const client = mount();
    keep(client);

    act(() => setSession({ ...ANA, accessToken: 'renewed' }));

    expect(client.getQueryData(['drivers'])).toEqual(['of the first branch']);
  });

  it('has nothing to forget when somebody signs in from a signed-out page', () => {
    const client = mount();
    keep(client);

    act(() => setSession(ANA));

    expect(client.getQueryData(['drivers'])).toEqual(['of the first branch']);
  });
});
