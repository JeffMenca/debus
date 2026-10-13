import { readDriverListParams, writeDriverListParams } from './driver-list-params';

const read = (search: string) => readDriverListParams(new URLSearchParams(search));

it('shows the active drivers unless the address says otherwise', () => {
  expect(read('')).toEqual({ status: 'active', page: 1, pageSize: 20 });
  expect(read('estado=inactivos')).toMatchObject({ status: 'inactive' });
  expect(read('estado=todos&buscar=Julio&pagina=2')).toEqual({
    status: 'all',
    q: 'Julio',
    page: 2,
    pageSize: 20,
  });
  expect(read('estado=raro')).toMatchObject({ status: 'active' });
});

it('ignores a search longer than the API accepts', () => {
  expect(read(`buscar=${'x'.repeat(81)}`)).toEqual({ status: 'active', page: 1, pageSize: 20 });
});

it('keeps the default tab and page out of the address and gives back what it wrote', () => {
  expect(writeDriverListParams({ status: 'active', page: 1, pageSize: 20 }).toString()).toBe('');
  const view = { status: 'all' as const, q: 'Ana', page: 2, pageSize: 100 };
  expect(writeDriverListParams(view).toString()).toBe(
    'estado=todos&buscar=Ana&pagina=2&mostrar=100',
  );
  expect(readDriverListParams(writeDriverListParams(view))).toEqual(view);
});
