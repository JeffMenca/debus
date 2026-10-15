import { renderHook, waitFor } from '@testing-library/react';
import { z } from 'zod';
import { queryWrapper } from '../test-support/query-wrapper';
import { useReport } from './use-report';

const PATH = '/api/reportes/reports/branch-buses';
const schema = z.object({ total: z.number() });

afterEach(() => jest.restoreAllMocks());

describe('useReport', () => {
  it('asks the report for the search of the screen and validates the answer', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(Response.json({ total: 4 }));
    const { wrapper } = queryWrapper();

    const { result } = renderHook(
      () => useReport(PATH, new URLSearchParams('page=2&status=IN_WORKSHOP'), schema),
      { wrapper },
    );

    await waitFor(() => expect(result.current.data).toEqual({ total: 4 }));
    expect(fetchMock).toHaveBeenCalledWith(
      `http://localhost:4000${PATH}?page=2&status=IN_WORKSHOP`,
      expect.anything(),
    );
  });

  it('keeps the previous answer while the next search arrives', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(Response.json({ total: 4 }))
      .mockImplementationOnce(() => new Promise(() => undefined));
    const { wrapper } = queryWrapper();
    const { result, rerender } = renderHook(
      ({ search }: { search: string }) => useReport(PATH, new URLSearchParams(search), schema),
      { wrapper, initialProps: { search: 'page=1' } },
    );
    await waitFor(() => expect(result.current.data).toEqual({ total: 4 }));

    rerender({ search: 'page=2' });

    expect(result.current.data).toEqual({ total: 4 });
    expect(result.current.isPlaceholderData).toBe(true);
  });

  it('fails when the answer does not match the contract', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(Response.json({ total: 'many' }));
    const { wrapper } = queryWrapper();

    const { result } = renderHook(() => useReport(PATH, new URLSearchParams(''), schema), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
