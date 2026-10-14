import { categoryListWhere } from './category-rules';

describe('categoryListWhere', () => {
  it.each([
    ['active', { active: true }],
    ['inactive', { active: false }],
    ['all', {}],
  ] as const)('filters the %s tab', (status, where) => {
    expect(categoryListWhere({ status, page: 1, pageSize: 20 })).toEqual(where);
  });

  it('searches the folded text of the name', () => {
    expect(categoryListWhere({ status: 'all', q: 'cambio', page: 1, pageSize: 20 })).toEqual({
      searchText: { contains: 'cambio' },
    });
  });

  it('searches for % and _ as characters, not as wildcards', () => {
    expect(categoryListWhere({ status: 'active', q: '50%_', page: 1, pageSize: 20 })).toEqual({
      active: true,
      searchText: { contains: '50\\%\\_' },
    });
  });
});
