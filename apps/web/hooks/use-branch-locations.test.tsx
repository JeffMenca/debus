import { renderHook, waitFor } from '@testing-library/react';
import { queryWrapper } from '../test-support/query-wrapper';
import { publicBranchLocationPageSchema } from '@debus/contracts';
import { parseLocations, useBranchLocations } from './use-branch-locations';

const location = {
  id: '9b2c7a10-1111-4c4c-8888-123456789abc',
  name: 'Quetzaltenango',
  municipality: 'Quetzaltenango',
  department: 'Quetzaltenango',
  latitude: 14.8347,
  longitude: -91.5181,
};

afterEach(() => jest.restoreAllMocks());

describe('useBranchLocations', () => {
  it('asks the open route for the biggest page and gives the places', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(Response.json({ items: [location], total: 1, page: 1, pageSize: 100 }));
    const { wrapper } = queryWrapper();

    const { result } = renderHook(() => useBranchLocations(), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual([location]));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'http://localhost:4000/api/administracion/branches/locations?pageSize=100',
    );
  });

  it('does not take what is not a page of locations', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(Response.json({ items: [{ id: 'x' }] }));
    const { wrapper } = queryWrapper();

    const { result } = renderHook(() => useBranchLocations(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it('fails when the request does', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(Response.json({ message: 'No disponible' }, { status: 503 }));
    const { wrapper } = queryWrapper();

    const { result } = renderHook(() => useBranchLocations(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('parseLocations', () => {
  const page = { items: [location], total: 1, page: 1, pageSize: 100 };

  it('takes what the contract takes', () => {
    expect(publicBranchLocationPageSchema.parse(page)).toEqual(page);
    expect(parseLocations(page)).toEqual(page);
  });

  it('drops the fields the map does not use, as the contract does', () => {
    const extra = { ...page, items: [{ ...location, phone: '77612233' }] };
    expect(parseLocations(extra)).toEqual(publicBranchLocationPageSchema.parse(extra));
  });

  it.each([
    ['null', null],
    ['a list', []],
    ['without items', { total: 1, page: 1, pageSize: 100 }],
    ['an item that is not an object', { ...page, items: [3] }],
    ['an item without coordinates', { ...page, items: [{ ...location, latitude: undefined }] }],
    ['a text coordinate', { ...page, items: [{ ...location, longitude: '-90' }] }],
    ['an item without a name', { ...page, items: [{ ...location, name: 7 }] }],
    ['a total that is not a number', { ...page, total: 'many' }],
  ])('refuses %s, as the contract does', (_label, value) => {
    expect(publicBranchLocationPageSchema.safeParse(value).success).toBe(false);
    expect(() => parseLocations(value)).toThrow();
  });
});
