import {
  readTicketIncomeReportParams,
  ticketIncomeReportSearch,
  writeTicketIncomeReportParams,
} from './ticket-income-report-params';

const ROUTE = '6e5f4a3b-9c8d-4e7f-8a0b-2c3d4e5f6a7b';
const BUS = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const read = (search: string) => readTicketIncomeReportParams(new URLSearchParams(search));

it('reads the Spanish address into the query of the report and back', () => {
  const address = `desde=2026-10-01&hasta=2026-10-13&ruta=${ROUTE}&bus=${BUS}&pagina=2&mostrar=50`;
  const view = read(address);

  expect(view).toEqual({
    from: '2026-10-01',
    to: '2026-10-13',
    routeId: ROUTE,
    busId: BUS,
    page: 2,
    pageSize: 50,
  });
  expect(writeTicketIncomeReportParams(view).toString()).toBe(address);
});

it('takes every record, route and bus unless the address says otherwise', () => {
  expect(read('')).toEqual({ page: 1, pageSize: 20 });
  expect(writeTicketIncomeReportParams(read('')).toString()).toBe('');
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
  expect(read('ruta=no&bus=tampoco')).toEqual({ page: 1, pageSize: 20 });
});

it('asks the API with the names of its contract', () => {
  expect(
    ticketIncomeReportSearch({
      from: '2026-10-01',
      to: '2026-10-13',
      routeId: ROUTE,
      busId: BUS,
      page: 2,
      pageSize: 50,
    }).toString(),
  ).toBe(`busId=${BUS}&from=2026-10-01&page=2&pageSize=50&routeId=${ROUTE}&to=2026-10-13`);
  expect(ticketIncomeReportSearch({ page: 1, pageSize: 20 }).toString()).toBe('page=1&pageSize=20');
});
