import {
  readRepairCategoryParams,
  repairCategorySearch,
  writeRepairCategoryParams,
} from './repair-category-report-params';

const BRANCH = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const BUS = '6e5f4a3b-9c8d-4e7f-8a0b-2c3d4e5f6a7b';
const read = (search: string) => readRepairCategoryParams(new URLSearchParams(search));

it('reads the branch and the bus from the address and writes them back', () => {
  const address = `desde=2026-10-01&hasta=2026-10-13&sucursal=${BRANCH}&bus=${BUS}&pagina=3&mostrar=100`;
  const view = read(address);

  expect(view).toEqual({
    from: '2026-10-01',
    to: '2026-10-13',
    branchId: BRANCH,
    busId: BUS,
    page: 3,
    pageSize: 100,
  });
  expect(writeRepairCategoryParams(view).toString()).toBe(address);
});

it('takes every bus unless the address names one, and drops a bus that is not an id', () => {
  expect(read('')).toEqual({ page: 1, pageSize: 20 });
  expect(read('bus=C482BTX')).toEqual({ page: 1, pageSize: 20 });
  expect(writeRepairCategoryParams(read('')).toString()).toBe('');
});

it('asks the API with the names of its contract', () => {
  expect(
    repairCategorySearch({
      branchId: BRANCH,
      busId: BUS,
      from: '2026-10-01',
      page: 1,
      pageSize: 20,
    }).toString(),
  ).toBe(`branchId=${BRANCH}&busId=${BUS}&from=2026-10-01&page=1&pageSize=20`);
});
