import { renderHook, waitFor } from '@testing-library/react';
import { queryWrapper } from '../test-support/query-wrapper';
import {
  useBranch,
  useBranches,
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

afterEach(() => jest.restoreAllMocks());

describe('useBranches', () => {
  it('asks only for active branches by default and validates the answer', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(Response.json([branch]));
    const { wrapper } = queryWrapper();
    const { result } = renderHook(() => useBranches({ includeInactive: false }), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual([branch]));
    expect(fetchMock).toHaveBeenCalledWith(API, expect.anything());
  });

  it('asks for the inactive ones too when requested', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(Response.json([branch]));
    const { wrapper } = queryWrapper();
    const { result } = renderHook(() => useBranches({ includeInactive: true }), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual([branch]));
    expect(fetchMock).toHaveBeenCalledWith(`${API}?includeInactive=true`, expect.anything());
  });

  it('fails when the server sends something that is not a branch list', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(Response.json([{ id: 'x' }]));
    const { wrapper } = queryWrapper();
    const { result } = renderHook(() => useBranches({ includeInactive: false }), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
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
