import { act, renderHook, waitFor } from '@testing-library/react';
import { page, repairExpense } from '../test-support/expenses';
import { queryWrapper } from '../test-support/query-wrapper';
import { useCreateRepairExpense, useRepairExpensesPage } from './use-repair-expenses';

const API = 'http://localhost:4000/api/administracion/repair-expenses';
const BUS_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const CATEGORY_ID = '1b2c3d4e-5f60-4a71-8b82-93a4b5c6d7e8';

afterEach(() => jest.restoreAllMocks());

describe('useRepairExpensesPage', () => {
  it('asks for the filters and page of the screen and validates the answer with its total', async () => {
    const answer = page([repairExpense()], { summary: { total: 5200 } });
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(Response.json(answer));
    const { wrapper } = queryWrapper();
    const { result } = renderHook(
      () =>
        useRepairExpensesPage({
          busId: BUS_ID,
          categoryId: CATEGORY_ID,
          from: '2026-10-01',
          to: '2026-10-31',
          q: 'bomba',
          page: 2,
          pageSize: 50,
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.data).toEqual(answer));
    expect(fetchMock).toHaveBeenCalledWith(
      `${API}?busId=${BUS_ID}&categoryId=${CATEGORY_ID}&from=2026-10-01&page=2&pageSize=50&q=bomba&to=2026-10-31`,
      expect.anything(),
    );
  });

  it('fails when the answer carries no total', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(Response.json(page([repairExpense()])));
    const { wrapper } = queryWrapper();
    const { result } = renderHook(() => useRepairExpensesPage({ page: 1, pageSize: 20 }), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('useCreateRepairExpense', () => {
  const request = {
    id: '3d4e5f60-7182-4c93-8da4-b5c6d7e8f9a0',
    busId: BUS_ID,
    serviceDate: '2026-10-20',
    lines: [{ categoryId: CATEGORY_ID, kind: 'LABOR' as const, description: '', amount: 1200 }],
  };

  it('posts the expense with its id and refreshes the lists', async () => {
    const created = repairExpense();
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(Response.json(created));
    const { client, wrapper } = queryWrapper();
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useCreateRepairExpense(), { wrapper });

    let saved: unknown;
    await act(async () => {
      saved = await result.current.mutateAsync(request);
    });

    expect(saved).toEqual(created);
    expect(fetchMock).toHaveBeenCalledWith(
      API,
      expect.objectContaining({ method: 'POST', body: JSON.stringify(request) }),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['repair-expenses'] });
  });

  it('rejects with the service message when the bus is not valid', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        Response.json({ statusCode: 409, message: 'Ese bus está desactivado.' }, { status: 409 }),
      );
    const { wrapper } = queryWrapper();
    const { result } = renderHook(() => useCreateRepairExpense(), { wrapper });

    await expect(act(() => result.current.mutateAsync(request))).rejects.toMatchObject({
      status: 409,
      message: 'Ese bus está desactivado.',
    });
  });
});
