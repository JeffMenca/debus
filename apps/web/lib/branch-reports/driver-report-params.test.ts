import {
  driverReportSearch,
  readDriverReportParams,
  writeDriverReportParams,
} from './driver-report-params';

const read = (search: string) => readDriverReportParams(new URLSearchParams(search));

it('reads the Spanish address into the query of the report and back', () => {
  const view = read('estado=inactivos&buscar=nunez&pagina=2&mostrar=50');

  expect(view).toEqual({ status: 'inactive', q: 'nunez', page: 2, pageSize: 50 });
  expect(writeDriverReportParams(view).toString()).toBe(
    'estado=inactivos&buscar=nunez&pagina=2&mostrar=50',
  );
});

it('lists every driver unless the address says otherwise', () => {
  expect(read('')).toEqual({ status: 'all', page: 1, pageSize: 20 });
  expect(writeDriverReportParams(read('')).toString()).toBe('');
});

it.each([
  ['activos', 'active'],
  ['inactivos', 'inactive'],
])('maps estado=%s to %s', (slug, status) => {
  expect(read(`estado=${slug}`).status).toBe(status);
  expect(
    writeDriverReportParams({ status: status as never, page: 1, pageSize: 20 }).get('estado'),
  ).toBe(slug);
});

it('ignores a status it does not know and a search the API would refuse', () => {
  expect(read('estado=raro').status).toBe('all');
  expect(read(`buscar=${'x'.repeat(81)}`)).toEqual({ status: 'all', page: 1, pageSize: 20 });
});

it('asks the API with the names of its contract', () => {
  expect(
    driverReportSearch({ status: 'inactive', q: 'nunez', page: 2, pageSize: 50 }).toString(),
  ).toBe('page=2&pageSize=50&q=nunez&status=inactive');
  expect(driverReportSearch({ status: 'all', page: 1, pageSize: 20 }).toString()).toBe(
    'page=1&pageSize=20&status=all',
  );
});
