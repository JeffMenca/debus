import { renderHook, waitFor } from '@testing-library/react';
import { queryWrapper } from '../test-support/query-wrapper';
import {
  useBranch,
  useBranchCounts,
  useBranchOptions,
  useBranchesPage,
  useCreateBranch,
  useSetBranchActive,
  useUpdateBranch,
} from './use-branches';

const branch = {
  id: '9b2c7a10-1111-4c4c-8888-123456789abc',
  code: 'XEL',
  name: 'Quetzaltenango',
  department: 'Quetzaltenango',
  municipality: 'Quetzaltenango',
  address: '4a calle 12-30 zona 1',
  phone: '77612233',
  latitude: 14.8347,
  longitude: -91.5181,
  active: true,
  version: 1,
  admins: [],
};
const API = 'http://localhost:4000/api/administracion/branches';
// What staff and clients receive: the branch without its administrators.
const branchWithoutAdmins = Object.fromEntries(
  Object.entries(branch).filter(([key]) => key !== 'admins'),
);

afterEach(() => jest.restoreAllMocks());

const branchPage = {
  items: [branch],
  total: 21,
  page: 2,
  pageSize: 20,
  summary: { statusCounts: { active: 20, inactive: 1 } },
};

describe('paged branch hooks', () => {
  it('asks for the page, tab and search of the screen and validates the answer', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(Response.json(branchPage));
    const { wrapper } = queryWrapper();
    const { result } = renderHook(
      () => useBranchesPage({ status: 'all', q: 'xela', page: 2, pageSize: 20 }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.data).toEqual(branchPage));
    expect(fetchMock).toHaveBeenCalledWith(
      `${API}?page=2&pageSize=20&q=xela&status=all`,
      expect.anything(),
    );
  });

  it('fails when the server answers a list instead of a page', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(Response.json([branch]));
    const { wrapper } = queryWrapper();
    const { result } = renderHook(
      () => useBranchesPage({ status: 'active', page: 1, pageSize: 20 }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('offers up to 100 branches to choose from', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(Response.json(branchPage));
    const { wrapper } = queryWrapper();
    const { result } = renderHook(() => useBranchOptions({ status: 'active' }), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual([branchWithoutAdmins]));
    expect(fetchMock).toHaveBeenCalledWith(`${API}?pageSize=100&status=active`, expect.anything());
  });

  it('reads the options the way a branch admin receives them, without admins', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(Response.json({ ...branchPage, items: [branchWithoutAdmins] }));
    const { wrapper } = queryWrapper();
    const { result } = renderHook(() => useBranchOptions({ status: 'active' }), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual([branchWithoutAdmins]));
  });

  it('counts active and inactive branches with a single row', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(Response.json(branchPage));
    const { wrapper } = queryWrapper();
    const { result } = renderHook(() => useBranchCounts(), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual({ active: 20, inactive: 1 }));
    expect(fetchMock).toHaveBeenCalledWith(`${API}?page=1&pageSize=1`, expect.anything());
  });
});

describe('useBranch', () => {
  it('loads one branch by id', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(Response.json(branch));
    const { wrapper } = queryWrapper();
    const { result } = renderHook(() => useBranch(branch.id), { wrapper });

    const { admins: _admins, ...withoutAdmins } = branch;
    await waitFor(() => expect(result.current.data).toEqual(withoutAdmins));
    expect(fetchMock).toHaveBeenCalledWith(`${API}/${branch.id}`, expect.anything());
  });

  it('reads the branch the way staff and clients receive it, without admins', async () => {
    const { admins: _admins, ...withoutAdmins } = branch;
    jest.spyOn(global, 'fetch').mockResolvedValue(Response.json(withoutAdmins));
    const { wrapper } = queryWrapper();
    const { result } = renderHook(() => useBranch(branch.id), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual(withoutAdmins));
  });

  it('does not ask for anything without an id', () => {
    const fetchMock = jest.spyOn(global, 'fetch');
    const { wrapper } = queryWrapper();
    const { result } = renderHook(() => useBranch(null), { wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('branch mutations', () => {
  it('creates a branch with its first admin and refreshes the lists', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(Response.json(branch));
    const { client, wrapper } = queryWrapper();
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useCreateBranch(), { wrapper });
    const body = {
      code: 'XEL',
      name: 'Quetzaltenango',
      department: 'Quetzaltenango' as const,
      municipality: 'Quetzaltenango',
      address: '4a calle 12-30 zona 1',
      phone: '77612233',
      latitude: 14.8347,
      longitude: -91.5181,
      admin: { fullName: 'Luis Ramírez', email: 'luis@correo.com' },
    };

    await result.current.mutateAsync(body);

    expect(fetchMock).toHaveBeenCalledWith(
      API,
      expect.objectContaining({ method: 'POST', body: JSON.stringify(body) }),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['branches'] });
  });

  it('updates a branch and refreshes it and the lists', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(Response.json(branch));
    const { client, wrapper } = queryWrapper();
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useUpdateBranch(branch.id), { wrapper });

    await result.current.mutateAsync({ phone: '77610000' });

    expect(fetchMock).toHaveBeenCalledWith(
      `${API}/${branch.id}`,
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ phone: '77610000' }) }),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['branches'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['branch', branch.id] });
  });

  it.each([
    [false, 'deactivate'],
    [true, 'reactivate'],
  ])('sets active=%s through %s and accepts an empty answer', async (active, action) => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));
    const { client, wrapper } = queryWrapper();
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useSetBranchActive(), { wrapper });

    await result.current.mutateAsync({ id: branch.id, active });

    expect(fetchMock).toHaveBeenCalledWith(
      `${API}/${branch.id}/${action}`,
      expect.objectContaining({ method: 'POST' }),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['branch', branch.id] });
  });
});
