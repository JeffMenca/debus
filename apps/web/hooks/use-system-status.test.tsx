import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useSystemStatus } from './use-system-status';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

it('loads the system status from the gateway', async () => {
  const status = { environment: 'local', checkedAt: '2026-10-06T12:00:00.000Z', units: [] };
  const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(Response.json(status));
  const { result } = renderHook(() => useSystemStatus(), { wrapper });

  await waitFor(() => expect(result.current.data).toEqual(status));
  expect(fetchMock).toHaveBeenCalledWith(
    'http://localhost:4000/api/sistema/estado',
    expect.anything(),
  );
  fetchMock.mockRestore();
});
