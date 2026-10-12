import { renderHook, waitFor } from '@testing-library/react';
import { queryWrapper } from '../test-support/query-wrapper';
import {
  useInviteUser,
  useResendInvitation,
  useSetUserActive,
  useUpdateUser,
  useUserCounts,
  useUsersPage,
} from './use-users';

const user = {
  id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  fullName: 'Ana Sic',
  email: 'ana@correo.com',
  role: 'CASHIER',
  branchId: '9b2c7a10-1111-4c4c-8888-123456789abc',
  status: 'PENDING',
};
const API = 'http://localhost:4000/api/administracion/users';

const page = {
  items: [{ ...user, branchName: 'Quetzaltenango' }],
  total: 41,
  page: 2,
  pageSize: 20,
  summary: { statusCounts: { ACTIVE: 30, PENDING: 10, INACTIVE: 1 } },
};

afterEach(() => jest.restoreAllMocks());

it('asks for the page and the filters of the screen and validates the answer', async () => {
  const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(Response.json(page));
  const { wrapper } = queryWrapper();
  const { result } = renderHook(
    () => useUsersPage({ page: 2, pageSize: 20, status: 'PENDING', q: 'ana' }),
    { wrapper },
  );

  await waitFor(() => expect(result.current.data).toEqual(page));
  expect(fetchMock).toHaveBeenCalledWith(
    `${API}?page=2&pageSize=20&q=ana&status=PENDING`,
    expect.anything(),
  );
});

it('fails when the server answers a list instead of a page', async () => {
  jest.spyOn(global, 'fetch').mockResolvedValue(Response.json([user]));
  const { wrapper } = queryWrapper();
  const { result } = renderHook(() => useUsersPage({ page: 1, pageSize: 20 }), { wrapper });

  await waitFor(() => expect(result.current.isError).toBe(true));
});

it('counts the staff by status with a single row', async () => {
  const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(Response.json(page));
  const { wrapper } = queryWrapper();
  const { result } = renderHook(() => useUserCounts(), { wrapper });

  await waitFor(() => expect(result.current.data).toEqual(page.summary.statusCounts));
  expect(fetchMock).toHaveBeenCalledWith(`${API}?group=staff&page=1&pageSize=1`, expect.anything());
});

it('invites a user and refreshes users and branches', async () => {
  const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(Response.json(user));
  const { client, wrapper } = queryWrapper();
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  const { result } = renderHook(() => useInviteUser(), { wrapper });
  const body = {
    fullName: 'Ana Sic',
    email: 'ana@correo.com',
    role: 'CASHIER' as const,
    branchId: user.branchId,
  };

  await result.current.mutateAsync(body);

  expect(fetchMock).toHaveBeenCalledWith(
    API,
    expect.objectContaining({ method: 'POST', body: JSON.stringify(body) }),
  );
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['users'] });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['branches'] });
});

it('edits a user with PATCH', async () => {
  const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(Response.json(user));
  const { wrapper } = queryWrapper();
  const { result } = renderHook(() => useUpdateUser(), { wrapper });

  await result.current.mutateAsync({ id: user.id, input: { fullName: 'Ana Sic López' } });

  expect(fetchMock).toHaveBeenCalledWith(
    `${API}/${user.id}`,
    expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ fullName: 'Ana Sic López' }),
    }),
  );
});

it.each([
  [false, 'deactivate'],
  [true, 'reactivate'],
])('sets active=%s through %s', async (active, action) => {
  const fetchMock = jest
    .spyOn(global, 'fetch')
    .mockResolvedValue(new Response(null, { status: 204 }));
  const { wrapper } = queryWrapper();
  const { result } = renderHook(() => useSetUserActive(), { wrapper });

  await result.current.mutateAsync({ id: user.id, active });

  expect(fetchMock).toHaveBeenCalledWith(
    `${API}/${user.id}/${action}`,
    expect.objectContaining({ method: 'POST' }),
  );
});

it('resends an invitation and returns the message', async () => {
  const fetchMock = jest
    .spyOn(global, 'fetch')
    .mockResolvedValue(
      Response.json({ message: 'Enviamos de nuevo la invitación.' }, { status: 202 }),
    );
  const { wrapper } = queryWrapper();
  const { result } = renderHook(() => useResendInvitation(), { wrapper });

  const answer = await result.current.mutateAsync(user.id);

  expect(answer).toEqual({ message: 'Enviamos de nuevo la invitación.' });
  expect(fetchMock).toHaveBeenCalledWith(
    `${API}/${user.id}/invitation`,
    expect.objectContaining({ method: 'POST' }),
  );
});
