import { readBusListParams, writeBusListParams } from './bus-list-params';

const read = (search: string) => readBusListParams(new URLSearchParams(search));

it('reads the Spanish address into the API query and back', () => {
  const view = read('estado=en-taller&buscar=volvo&pagina=2');

  expect(view).toEqual({ status: 'IN_WORKSHOP', q: 'volvo', page: 2, pageSize: 20 });
  expect(writeBusListParams(view).toString()).toBe('estado=en-taller&buscar=volvo&pagina=2');
});

it('shows every bus unless the address says otherwise', () => {
  expect(read('')).toEqual({ status: 'all', page: 1, pageSize: 20 });
  expect(read('estado=raro').status).toBe('all');
});

it.each([
  ['en-camino', 'IN_TRANSIT'],
  ['disponibles', 'AVAILABLE'],
  ['en-taller', 'IN_WORKSHOP'],
  ['inactivos', 'INACTIVE'],
])('maps estado=%s to %s', (slug, status) => {
  expect(read(`estado=${slug}`).status).toBe(status);
  expect(writeBusListParams({ status: status as never, page: 1, pageSize: 20 }).get('estado')).toBe(
    slug,
  );
});

it('ignores a search longer than the API accepts', () => {
  expect(read(`buscar=${'x'.repeat(81)}`)).toEqual({ status: 'all', page: 1, pageSize: 20 });
});

it('keeps the default tab, page and size out of the address', () => {
  expect(writeBusListParams({ status: 'all', page: 1, pageSize: 20 }).toString()).toBe('');
  expect(
    writeBusListParams({ status: 'AVAILABLE', q: 'c48', page: 3, pageSize: 50 }).toString(),
  ).toBe('estado=disponibles&buscar=c48&pagina=3&mostrar=50');
});
