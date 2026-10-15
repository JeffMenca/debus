import {
  depreciationReportSearch,
  readDepreciationReportParams,
  writeDepreciationReportParams,
} from './depreciation-report-params';

const read = (search: string) => readDepreciationReportParams(new URLSearchParams(search));

it('reads the Spanish address into the query of the report and back', () => {
  const view = read('desde=2026-10-01&hasta=2026-10-13&buscar=volvo&pagina=2&mostrar=50');

  expect(view).toEqual({
    from: '2026-10-01',
    to: '2026-10-13',
    q: 'volvo',
    page: 2,
    pageSize: 50,
  });
  expect(writeDepreciationReportParams(view).toString()).toBe(
    'desde=2026-10-01&hasta=2026-10-13&buscar=volvo&pagina=2&mostrar=50',
  );
});

it('takes every record unless the address says otherwise', () => {
  expect(read('')).toEqual({ page: 1, pageSize: 20 });
  expect(writeDepreciationReportParams(read('')).toString()).toBe('');
});

it('accepts a period with only one end', () => {
  expect(read('desde=2026-10-01')).toEqual({ from: '2026-10-01', page: 1, pageSize: 20 });
  expect(read('hasta=2026-10-13')).toEqual({ to: '2026-10-13', page: 1, pageSize: 20 });
});

it('ignores a period that goes backwards, a strange day and a search the API would refuse', () => {
  expect(read('desde=2026-10-13&hasta=2026-10-01')).toEqual({
    from: '2026-10-13',
    page: 1,
    pageSize: 20,
  });
  expect(read('desde=ayer')).toEqual({ page: 1, pageSize: 20 });
  expect(read(`buscar=${'x'.repeat(81)}`)).toEqual({ page: 1, pageSize: 20 });
});

it('asks the API with the names of its contract', () => {
  expect(
    depreciationReportSearch({
      from: '2026-10-01',
      to: '2026-10-13',
      q: 'volvo',
      page: 2,
      pageSize: 50,
    }).toString(),
  ).toBe('from=2026-10-01&page=2&pageSize=50&q=volvo&to=2026-10-13');
  expect(depreciationReportSearch({ page: 1, pageSize: 20 }).toString()).toBe('page=1&pageSize=20');
});
