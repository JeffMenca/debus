import { act, renderHook, waitFor } from '@testing-library/react';
import { category, page } from '../test-support/expenses';
import { queryWrapper } from '../test-support/query-wrapper';
import {
  useDeleteExpenseCategory,
  useExpenseCategoriesPage,
  useSaveExpenseCategory,
} from './use-expense-categories';

const API = 'http://localhost:4000/api/administracion/expense-categories';

afterEach(() => jest.restoreAllMocks());

describe('useExpenseCategoriesPage', () => {
  it('asks for the state, search and page of the screen and validates the answer', async () => {
    const answer = page([category()]);
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(Response.json(answer));
    const { wrapper } = queryWrapper();
    const { result } = renderHook(
      () => useExpenseCategoriesPage({ status: 'inactive', q: 'motor', page: 2, pageSize: 50 }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.data).toEqual(answer));
    expect(fetchMock).toHaveBeenCalledWith(
      `${API}?page=2&pageSize=50&q=motor&status=inactive`,
      expect.anything(),
    );
  });

  it('fails when the answer is not a page of categories', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(Response.json([category()]));
    const { wrapper } = queryWrapper();
    const { result } = renderHook(
      () => useExpenseCategoriesPage({ status: 'active', page: 1, pageSize: 20 }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('useSaveExpenseCategory', () => {
  it('creates with POST and refreshes the categories', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(Response.json(category()));
    const { client, wrapper } = queryWrapper();
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useSaveExpenseCategory(), { wrapper });

    await act(() => result.current.mutateAsync({ request: { name: 'Turbo' } }));

    expect(fetchMock).toHaveBeenCalledWith(
      API,
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: 'Turbo' }) }),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['expense-categories'] });
  });

  it('updates with PATCH when it has an id', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(Response.json(category()));
    const { wrapper } = queryWrapper();
    const { result } = renderHook(() => useSaveExpenseCategory(), { wrapper });

    await act(() => result.current.mutateAsync({ id: 'c1', request: { active: false } }));

    expect(fetchMock).toHaveBeenCalledWith(
      `${API}/c1`,
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ active: false }) }),
    );
  });

  it('rejects with the service message when the name is taken', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        Response.json(
          { statusCode: 409, message: 'Ya existe una categoría con ese nombre.' },
          { status: 409 },
        ),
      );
    const { wrapper } = queryWrapper();
    const { result } = renderHook(() => useSaveExpenseCategory(), { wrapper });

    await expect(
      act(() => result.current.mutateAsync({ request: { name: 'Motor' } })),
    ).rejects.toMatchObject({ status: 409, message: 'Ya existe una categoría con ese nombre.' });
  });
});

describe('useDeleteExpenseCategory', () => {
  it('deletes with DELETE and refreshes the categories', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));
    const { client, wrapper } = queryWrapper();
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useDeleteExpenseCategory(), { wrapper });

    await act(() => result.current.mutateAsync('c1'));

    expect(fetchMock).toHaveBeenCalledWith(
      `${API}/c1`,
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['expense-categories'] });
  });
});
