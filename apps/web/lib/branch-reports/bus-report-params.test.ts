import { busReportSearch, readBusReportParams, writeBusReportParams } from './bus-report-params';

const read = (search: string) => readBusReportParams(new URLSearchParams(search));

it('reads the Spanish address into the query of the report and back', () => {
  const view = read('estado=en-taller&buscar=volvo&pagina=2&mostrar=50');

  expect(view).toEqual({ status: 'IN_WORKSHOP', q: 'volvo', page: 2, pageSize: 50 });
  expect(writeBusReportParams(view).toString()).toBe(
    'estado=en-taller&buscar=volvo&pagina=2&mostrar=50',
  );
});

it('lists every bus unless the address says otherwise', () => {
  expect(read('')).toEqual({ status: 'all', page: 1, pageSize: 20 });
  expect(writeBusReportParams(read('')).toString()).toBe('');
});

it.each([
  ['en-ruta', 'IN_TRANSIT'],
  ['disponibles', 'AVAILABLE'],
  ['en-taller', 'IN_WORKSHOP'],
  ['inactivos', 'INACTIVE'],
])('maps estado=%s to %s', (slug, status) => {
  expect(read(`estado=${slug}`).status).toBe(status);
  expect(
    writeBusReportParams({ status: status as never, page: 1, pageSize: 20 }).get('estado'),
  ).toBe(slug);
});

it('ignores a status it does not know and a search the API would refuse', () => {
  expect(read('estado=raro').status).toBe('all');
  expect(read(`buscar=${'x'.repeat(81)}`)).toEqual({ status: 'all', page: 1, pageSize: 20 });
});

it('asks the API with the names of its contract', () => {
  expect(
    busReportSearch({ status: 'IN_WORKSHOP', q: 'volvo', page: 2, pageSize: 50 }).toString(),
  ).toBe('page=2&pageSize=50&q=volvo&status=IN_WORKSHOP');
  expect(busReportSearch({ status: 'all', page: 1, pageSize: 20 }).toString()).toBe(
    'page=1&pageSize=20&status=all',
  );
});
