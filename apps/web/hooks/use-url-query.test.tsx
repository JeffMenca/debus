import { PAGE_SIZE_OPTIONS, type PageQuery } from '@debus/contracts';
import { act, renderHook } from '@testing-library/react';
import { PAGE_PARAM, PAGE_SIZE_PARAM, readPage, writePage } from '@/lib/list/page-params';
import { useUrlQuery } from './use-url-query';

const replace = jest.fn();
let search = '';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/admin/usuarios',
  useSearchParams: () => new URLSearchParams(search),
}));

interface View extends PageQuery {
  status?: 'activos' | 'pendientes';
}
const read = (params: URLSearchParams): View => {
  const status = params.get('estado');
  return {
    ...readPage(params),
    ...((status === 'activos' || status === 'pendientes') && { status }),
  };
};
const write = (view: View): URLSearchParams => {
  const params = new URLSearchParams();
  if (view.status) params.set('estado', view.status);
  writePage(params, view);
  return params;
};

const lastCall = () => {
  const [url, options] = replace.mock.calls.at(-1) as [string, unknown];
  const [path, query = ''] = url.split('?');
  return { path, params: new URLSearchParams(query), options };
};

beforeEach(() => {
  replace.mockReset();
  search = 'pagina=3&estado=activos';
});

it('reads the list state from the address', () => {
  const { result } = renderHook(() => useUrlQuery(read, write));

  expect(result.current[0]).toEqual({ page: 3, pageSize: 20, status: 'activos' });
});

it('moves to another page without scrolling and keeps the filters', () => {
  const { result } = renderHook(() => useUrlQuery(read, write));

  act(() => result.current[1]({ page: 4 }));

  const { path, params, options } = lastCall();
  expect(path).toBe('/admin/usuarios');
  expect(params.get(PAGE_PARAM)).toBe('4');
  expect(params.get('estado')).toBe('activos');
  expect(options).toEqual({ scroll: false });
});

it('goes back to the first page when a filter changes', () => {
  const { result } = renderHook(() => useUrlQuery(read, write));

  act(() => result.current[1]({ status: 'pendientes' }));

  const { params } = lastCall();
  expect(params.has(PAGE_PARAM)).toBe(false);
  expect(params.get('estado')).toBe('pendientes');
});

it('goes back to the first page when the size changes', () => {
  const { result } = renderHook(() => useUrlQuery(read, write));

  act(() => result.current[1]({ pageSize: PAGE_SIZE_OPTIONS[1] }));

  const { params } = lastCall();
  expect(params.has(PAGE_PARAM)).toBe(false);
  expect(params.get(PAGE_SIZE_PARAM)).toBe('50');
});

it('leaves a clean address when nothing is left to say', () => {
  search = 'pagina=2';
  const { result } = renderHook(() => useUrlQuery(read, write));

  act(() => result.current[1]({ page: 1 }));

  expect(replace).toHaveBeenCalledWith('/admin/usuarios', { scroll: false });
});
