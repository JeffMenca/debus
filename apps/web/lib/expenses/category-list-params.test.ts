import { SEARCH_MAX_LENGTH } from '@debus/contracts';
import { readCategoryListParams, writeCategoryListParams } from './category-list-params';

const read = (search: string) => readCategoryListParams(new URLSearchParams(search));

it('opens on the active categories', () => {
  expect(read('')).toEqual({ status: 'active', page: 1, pageSize: 20 });
});

it('reads the Spanish address into the API query and back', () => {
  const view = read('estado=inactivas&buscar=motor&pagina=2');

  expect(view).toEqual({ status: 'inactive', q: 'motor', page: 2, pageSize: 20 });
  expect(writeCategoryListParams(view).toString()).toBe('estado=inactivas&buscar=motor&pagina=2');
});

it.each([
  ['activas', 'active'],
  ['inactivas', 'inactive'],
  ['todas', 'all'],
])('maps estado=%s to %s', (slug, status) => {
  expect(read(`estado=${slug}`).status).toBe(status);
});

it('keeps the defaults out of the address', () => {
  expect(writeCategoryListParams({ status: 'active', page: 1, pageSize: 20 }).toString()).toBe('');
});

it('falls back to the defaults when the address carries strange values', () => {
  expect(read(`estado=raro&buscar=${'x'.repeat(SEARCH_MAX_LENGTH + 1)}`)).toEqual({
    status: 'active',
    page: 1,
    pageSize: 20,
  });
});
