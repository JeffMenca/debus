import { toQueryString } from './query-string';

it('drops empty values and sorts keys', () => {
  expect(toQueryString({ pageSize: 20, q: '', page: 2, role: undefined, status: 'ACTIVE' })).toBe(
    'page=2&pageSize=20&status=ACTIVE',
  );
});

it('escapes what needs escaping and skips nulls', () => {
  expect(toQueryString({ q: 'José Pérez', branchId: null })).toBe('q=Jos%C3%A9+P%C3%A9rez');
});
