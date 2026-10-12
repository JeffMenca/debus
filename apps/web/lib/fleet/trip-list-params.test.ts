import { readTripListParams, writeTripListParams } from './trip-list-params';

const TODAY = '2026-10-12';
const read = (search: string) => readTripListParams(new URLSearchParams(search), TODAY);
const write = (view: Parameters<typeof writeTripListParams>[0]) =>
  writeTripListParams(view, TODAY).toString();

it('reads the Spanish address into the API query and back', () => {
  const view = read('desde=2026-10-14&hasta=2026-10-20&estado=en-camino&buscar=xela&pagina=2');

  expect(view).toEqual({
    from: '2026-10-14',
    to: '2026-10-20',
    status: 'IN_TRANSIT',
    q: 'xela',
    page: 2,
    pageSize: 20,
  });
  expect(write(view)).toBe(
    'desde=2026-10-14&hasta=2026-10-20&estado=en-camino&buscar=xela&pagina=2',
  );
});

it('starts today, on every status, so the list opens on what is next', () => {
  expect(read('')).toEqual({ from: TODAY, status: 'all', page: 1, pageSize: 20 });
});

it.each([
  ['programados', 'SCHEDULED'],
  ['en-camino', 'IN_TRANSIT'],
  ['completados', 'COMPLETED'],
])('maps estado=%s to %s', (slug, status) => {
  expect(read(`estado=${slug}`).status).toBe(status);
  expect(write({ from: TODAY, status: status as never, page: 1, pageSize: 20 })).toBe(
    `estado=${slug}`,
  );
});

it('falls back to today and to every status when the address carries strange values', () => {
  expect(read('desde=ayer&estado=raro')).toEqual({
    from: TODAY,
    status: 'all',
    page: 1,
    pageSize: 20,
  });
});

it('drops an end day that falls before the first one', () => {
  expect(read('desde=2026-10-20&hasta=2026-10-14').to).toBeUndefined();
  expect(read('hasta=nunca').to).toBeUndefined();
});

it('ignores a search longer than the API accepts', () => {
  expect(read(`buscar=${'x'.repeat(81)}`).q).toBeUndefined();
});

it('keeps the defaults out of the address', () => {
  expect(write({ from: TODAY, status: 'all', page: 1, pageSize: 20 })).toBe('');
  expect(write({ from: TODAY, to: '2026-10-12', status: 'all', page: 3, pageSize: 50 })).toBe(
    'hasta=2026-10-12&pagina=3&mostrar=50',
  );
});
