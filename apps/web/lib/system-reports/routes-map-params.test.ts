import { readRoutesMapParams, routesMapSearch, writeRoutesMapParams } from './routes-map-params';

const BRANCH = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const read = (search: string) => readRoutesMapParams(new URLSearchParams(search));

it('reads the origin branch from the address and writes it back', () => {
  const view = read(`sucursal=${BRANCH}`);

  expect(view.branchId).toBe(BRANCH);
  expect(writeRoutesMapParams(view).toString()).toBe(`sucursal=${BRANCH}`);
});

it('leaves the choice to the server without a branch, and ignores a strange one', () => {
  expect(read('').branchId).toBeUndefined();
  expect(read('sucursal=xela').branchId).toBeUndefined();
  expect(writeRoutesMapParams(read('')).toString()).toBe('');
});

it('never pages: the map has no pages and the address stays clean', () => {
  const view = read('pagina=4&mostrar=100');

  expect(view).toMatchObject({ page: 1, pageSize: 20 });
  expect(writeRoutesMapParams(view).toString()).toBe('');
});

it('asks the API only for the branch', () => {
  expect(routesMapSearch(BRANCH).toString()).toBe(`branchId=${BRANCH}`);
  expect(routesMapSearch(undefined).toString()).toBe('');
});
