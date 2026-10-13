import { busSearchWhere } from './bus-scope';

describe('bus search', () => {
  it('has no condition without a term', () => {
    expect(busSearchWhere(undefined)).toEqual({});
  });

  it('looks for the term as typed', () => {
    expect(busSearchWhere('volvo')).toEqual({ searchText: { contains: 'volvo' } });
  });

  it('also looks for it without the hyphens and spaces of a plate written the way the table shows it', () => {
    expect(busSearchWhere('c-482btx')).toEqual({
      OR: [{ searchText: { contains: 'c-482btx' } }, { searchText: { contains: 'c482btx' } }],
    });
    expect(busSearchWhere('c 482 btx')).toEqual({
      OR: [{ searchText: { contains: 'c 482 btx' } }, { searchText: { contains: 'c482btx' } }],
    });
  });

  it('escapes the wildcards of the database', () => {
    expect(busSearchWhere('100%')).toEqual({ searchText: { contains: '100\\%' } });
  });
});
