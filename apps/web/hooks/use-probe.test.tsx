import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useProbe } from './use-probe';

const probeId = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useProbe', () => {
  afterEach(() => jest.restoreAllMocks());

  it('sends the probe and then follows its deliveries', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(Response.json({ probeId }, { status: 202 }))
      .mockResolvedValue(
        Response.json({ probeId, services: [{ service: 'flota', state: 'received' }] }),
      );
    const { result } = renderHook(() => useProbe(), { wrapper });

    expect(result.current.elapsedMs).toBe(0);
    act(() => result.current.send());

    await waitFor(() => expect(result.current.status?.services[0]?.state).toBe('received'));
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:4000/api/system/probes',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `http://localhost:4000/api/system/probes/${probeId}`,
      expect.anything(),
    );
    expect(result.current.elapsedMs).toBeGreaterThanOrEqual(0);
  });
});
