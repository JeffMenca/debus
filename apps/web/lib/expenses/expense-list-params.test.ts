import { SEARCH_MAX_LENGTH } from '@debus/contracts';
import { readExpenseListParams, writeExpenseListParams } from './expense-list-params';

const BUS_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const CATEGORY_ID = '1b2c3d4e-5f60-4a71-8b82-93a4b5c6d7e8';
const read = (search: string) => readExpenseListParams(new URLSearchParams(search));

it('starts with every bus, category and date', () => {
  expect(read('')).toEqual({ page: 1, pageSize: 20 });
});

it('reads the Spanish address into the API query and back', () => {
  const address = `bus=${BUS_ID}&categoria=${CATEGORY_ID}&desde=2026-10-01&hasta=2026-10-31&buscar=bomba&pagina=2`;
  const view = read(address);

  expect(view).toEqual({
    busId: BUS_ID,
    categoryId: CATEGORY_ID,
    from: '2026-10-01',
    to: '2026-10-31',
    q: 'bomba',
    page: 2,
    pageSize: 20,
  });
  expect(writeExpenseListParams(view).toString()).toBe(address);
});

it('keeps the defaults out of the address', () => {
  expect(writeExpenseListParams({ page: 1, pageSize: 20 }).toString()).toBe('');
});

it('drops strange values one by one', () => {
  expect(
    read(`bus=xx&categoria=yy&desde=ayer&hasta=nunca&buscar=${'x'.repeat(SEARCH_MAX_LENGTH + 1)}`),
  ).toEqual({ page: 1, pageSize: 20 });
});

it('drops an end day that falls before the first one', () => {
  expect(read('desde=2026-10-20&hasta=2026-10-14').to).toBeUndefined();
});
