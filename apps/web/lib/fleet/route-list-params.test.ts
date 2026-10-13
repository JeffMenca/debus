import { readRouteListParams, writeRouteListParams } from './route-list-params';

const read = (search: string) => readRouteListParams(new URLSearchParams(search));

it('shows the active routes unless the address says otherwise', () => {
  expect(read('')).toEqual({ status: 'active', page: 1, pageSize: 20 });
  expect(read('estado=retiradas')).toMatchObject({ status: 'inactive' });
  expect(read('estado=todas&buscar=Pet%C3%A9n')).toMatchObject({ status: 'all', q: 'Petén' });
  expect(read('estado=raro')).toMatchObject({ status: 'active' });
});

it('ignores a search longer than the API accepts', () => {
  expect(read(`buscar=${'x'.repeat(81)}`)).toEqual({ status: 'active', page: 1, pageSize: 20 });
});

it('keeps the default tab and page out of the address and gives back what it wrote', () => {
  expect(writeRouteListParams({ status: 'active', page: 1, pageSize: 20 }).toString()).toBe('');
  const view = { status: 'inactive' as const, q: 'Cobán', page: 3, pageSize: 50 };
  expect(writeRouteListParams(view).toString()).toBe(
    'estado=retiradas&buscar=Cobán&pagina=3&mostrar=50'.replace('Cobán', 'Cob%C3%A1n'),
  );
  expect(readRouteListParams(writeRouteListParams(view))).toEqual(view);
});
