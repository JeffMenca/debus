import {
  readSystemReportParams,
  systemReportSearch,
  writeSystemReportParams,
} from './system-report-params';

const BRANCH = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const read = (search: string) => readSystemReportParams(new URLSearchParams(search));

it('reads the Spanish address into the query of the report and back', () => {
  const address = `desde=2026-10-01&hasta=2026-10-13&sucursal=${BRANCH}&pagina=2&mostrar=50`;
  const view = read(address);

  expect(view).toEqual({
    from: '2026-10-01',
    to: '2026-10-13',
    branchId: BRANCH,
    page: 2,
    pageSize: 50,
  });
  expect(writeSystemReportParams(view).toString()).toBe(address);
});

it('takes every record and every branch unless the address says otherwise', () => {
  expect(read('')).toEqual({ page: 1, pageSize: 20 });
  expect(writeSystemReportParams(read('')).toString()).toBe('');
});

it('accepts a period with only one end', () => {
  expect(read('desde=2026-10-01')).toEqual({ from: '2026-10-01', page: 1, pageSize: 20 });
  expect(read('hasta=2026-10-13')).toEqual({ to: '2026-10-13', page: 1, pageSize: 20 });
});

it('ignores a period that goes backwards, a strange day and a branch that is not an id', () => {
  expect(read('desde=2026-10-13&hasta=2026-10-01')).toEqual({
    from: '2026-10-13',
    page: 1,
    pageSize: 20,
  });
  expect(read('desde=ayer&sucursal=todas&pagina=0&mostrar=7')).toEqual({ page: 1, pageSize: 20 });
});

it('asks the API with the names of its contract and without anything else', () => {
  expect(
    systemReportSearch({
      from: '2026-10-01',
      to: '2026-10-13',
      branchId: BRANCH,
      page: 2,
      pageSize: 50,
    }).toString(),
  ).toBe(`branchId=${BRANCH}&from=2026-10-01&page=2&pageSize=50&to=2026-10-13`);
  expect(systemReportSearch({ page: 1, pageSize: 20 }).toString()).toBe('page=1&pageSize=20');
});
