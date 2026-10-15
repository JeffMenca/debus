import {
  readRepairReportParams,
  repairReportSearch,
  writeRepairReportParams,
} from './repair-report-params';

const BUS = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const CATEGORY = '6e5f4a3b-9c8d-4e7f-8a0b-2c3d4e5f6a7b';
const read = (search: string) => readRepairReportParams(new URLSearchParams(search));

it('reads the Spanish address into the query of the report and back', () => {
  const address = `desde=2026-10-01&hasta=2026-10-13&bus=${BUS}&categoria=${CATEGORY}&pagina=2&mostrar=50`;
  const view = read(address);

  expect(view).toEqual({
    from: '2026-10-01',
    to: '2026-10-13',
    busId: BUS,
    categoryId: CATEGORY,
    page: 2,
    pageSize: 50,
  });
  expect(writeRepairReportParams(view).toString()).toBe(
    `desde=2026-10-01&hasta=2026-10-13&bus=${BUS}&categoria=${CATEGORY}&pagina=2&mostrar=50`,
  );
});

it('takes every record, bus and category unless the address says otherwise', () => {
  expect(read('')).toEqual({ page: 1, pageSize: 20 });
  expect(writeRepairReportParams(read('')).toString()).toBe('');
});

it('accepts a period with only one end', () => {
  expect(read('desde=2026-10-01')).toEqual({ from: '2026-10-01', page: 1, pageSize: 20 });
  expect(read('hasta=2026-10-13')).toEqual({ to: '2026-10-13', page: 1, pageSize: 20 });
});

it('ignores a period that goes backwards, a strange day and ids that are not ones', () => {
  expect(read('desde=2026-10-13&hasta=2026-10-01')).toEqual({
    from: '2026-10-13',
    page: 1,
    pageSize: 20,
  });
  expect(read('desde=ayer')).toEqual({ page: 1, pageSize: 20 });
  expect(read('bus=no&categoria=tampoco')).toEqual({ page: 1, pageSize: 20 });
});

it('asks the API with the names of its contract', () => {
  expect(
    repairReportSearch({
      from: '2026-10-01',
      to: '2026-10-13',
      busId: BUS,
      categoryId: CATEGORY,
      page: 2,
      pageSize: 50,
    }).toString(),
  ).toBe(`busId=${BUS}&categoryId=${CATEGORY}&from=2026-10-01&page=2&pageSize=50&to=2026-10-13`);
  expect(repairReportSearch({ page: 1, pageSize: 20 }).toString()).toBe('page=1&pageSize=20');
});
