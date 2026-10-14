import { SEARCH_MAX_LENGTH } from '@debus/contracts';
import {
  enumParam,
  lastPageIfOutOfRange,
  readDay,
  readId,
  readPage,
  readSearch,
  writePage,
} from './page-params';

it('reads the page and size from the address, falling back one by one', () => {
  expect(readPage(new URLSearchParams(''))).toEqual({ page: 1, pageSize: 20 });
  expect(readPage(new URLSearchParams('pagina=3&mostrar=50'))).toEqual({ page: 3, pageSize: 50 });
  expect(readPage(new URLSearchParams('pagina=abc&mostrar=50'))).toEqual({ page: 1, pageSize: 50 });
  expect(readPage(new URLSearchParams('pagina=2&mostrar=37'))).toEqual({ page: 2, pageSize: 20 });
  expect(readPage(new URLSearchParams('pagina=0'))).toEqual({ page: 1, pageSize: 20 });
  expect(readPage(new URLSearchParams('pagina=1.5'))).toEqual({ page: 1, pageSize: 20 });
});

it('keeps the defaults out of the address', () => {
  const params = new URLSearchParams();
  writePage(params, { page: 1, pageSize: 20 });
  expect(params.toString()).toBe('');
  writePage(params, { page: 2, pageSize: 50 });
  expect(params.toString()).toBe('pagina=2&mostrar=50');
});

it('maps values to Spanish words and back', () => {
  const status = enumParam({ ACTIVE: 'activos', PENDING: 'pendientes' });
  expect(status.read('activos')).toBe('ACTIVE');
  expect(status.read('ACTIVE')).toBeUndefined();
  expect(status.read(null)).toBeUndefined();
  expect(status.write('PENDING')).toBe('pendientes');
  expect(status.write(undefined)).toBeUndefined();
});

it('sends an empty page past the end back to the last one', () => {
  expect(lastPageIfOutOfRange({ items: [], total: 41, page: 9, pageSize: 20 })).toBe(3);
  expect(lastPageIfOutOfRange({ items: [], total: 0, page: 1, pageSize: 20 })).toBeNull();
  expect(lastPageIfOutOfRange({ items: [1], total: 41, page: 3, pageSize: 20 })).toBeNull();
  expect(lastPageIfOutOfRange({ items: [], total: 41, page: 1, pageSize: 20 })).toBeNull();
});

it('reads a search the API would accept and ignores the rest', () => {
  expect(readSearch('José')).toBe('José');
  expect(readSearch('x'.repeat(SEARCH_MAX_LENGTH))).toHaveLength(SEARCH_MAX_LENGTH);
  expect(readSearch('x'.repeat(SEARCH_MAX_LENGTH + 1))).toBeUndefined();
  expect(readSearch(` ${'x'.repeat(SEARCH_MAX_LENGTH)} `)).toHaveLength(SEARCH_MAX_LENGTH + 2);
  expect(readSearch('')).toBeUndefined();
  expect(readSearch(null)).toBeUndefined();
});

it('reads a calendar day and ignores anything else', () => {
  expect(readDay('2026-10-13')).toBe('2026-10-13');
  expect(readDay('2026-13-45')).toBeUndefined();
  expect(readDay('ayer')).toBeUndefined();
  expect(readDay(null)).toBeUndefined();
});

it('reads an id and ignores anything else', () => {
  expect(readId('7c9e6679-7425-40de-944b-e07fc1f90ae7')).toBe(
    '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  );
  expect(readId('7c9e6679')).toBeUndefined();
  expect(readId(null)).toBeUndefined();
});
