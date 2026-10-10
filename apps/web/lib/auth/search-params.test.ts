import { firstParam } from './search-params';

it('reads the first value of a query parameter', () => {
  expect(firstParam('abc')).toBe('abc');
  expect(firstParam(['a', 'b'])).toBe('a');
  expect(firstParam(undefined)).toBeNull();
  expect(firstParam('')).toBeNull();
  expect(firstParam([])).toBeNull();
});
