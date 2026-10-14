import { reportSearch } from './search';

it('builds the query of a report with sorted keys and without empty values', () => {
  expect(reportSearch({ status: 'IN_WORKSHOP', page: 2, q: undefined, from: '' }).toString()).toBe(
    'page=2&status=IN_WORKSHOP',
  );
});
