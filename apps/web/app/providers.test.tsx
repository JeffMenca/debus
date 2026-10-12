import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { act, render, screen } from '@testing-library/react';
import { clearSession, setSession } from '@/lib/auth/session-store';
import { Providers } from './providers';

function Probe() {
  return <p>{useQueryClient() ? 'con cliente' : 'sin cliente'}</p>;
}

it('provides a query client', () => {
  render(
    <Providers>
      <Probe />
    </Providers>,
  );

  expect(screen.getByText('con cliente')).toBeInTheDocument();
});

it('mounts the notification area', () => {
  const { container } = render(<Providers>contenido</Providers>);

  expect(container.ownerDocument.querySelector('section[aria-label]')).toBeInTheDocument();
});

function Grab({ onClient }: { onClient: (client: QueryClient) => void }) {
  const client = useQueryClient();
  useEffect(() => {
    onClient(client);
  }, [client, onClient]);
  return null;
}

it('forgets the data of a person when they sign out', () => {
  const clients: QueryClient[] = [];
  act(() =>
    setSession({
      accessToken: 'a',
      accessExpiresIn: 900,
      user: {
        id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
        fullName: 'Ana',
        email: 'a@b.com',
        role: 'CLIENT',
        branchId: null,
      },
    }),
  );
  render(
    <Providers>
      <Grab onClient={(client) => clients.push(client)} />
    </Providers>,
  );
  const [client] = clients;
  client?.setQueryData(['drivers'], ['private']);
  expect(client?.getQueryData(['drivers'])).toEqual(['private']);

  act(() => clearSession());

  expect(client?.getQueryData(['drivers'])).toBeUndefined();
});
