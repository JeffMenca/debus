import {
  SEARCH_MAX_LENGTH,
  escapeLikePattern,
  foldSearchText,
  formatPlate,
  searchTermSchema,
} from './text';

describe('foldSearchText', () => {
  it('drops accents and case so "José" matches "jose"', () => {
    expect(foldSearchText('  José Pérez Ñuñez ')).toBe('jose perez nunez');
    expect(foldSearchText('PETÉN')).toBe('peten');
  });

  it('folds the Latin letters the database folds, and only those', () => {
    expect(foldSearchText('François ÀÂÄ Łódź Ā')).toBe('francois aaa łodz a');
    expect(foldSearchText('Cafe\u0301')).toBe('cafe');
    // Outside U+00C0 to U+017F the database keeps the letter, so the application must too.
    expect(foldSearchText('Ế ^')).toBe('ế ^');
  });

  it('folds the search term from the query string', () => {
    expect(searchTermSchema.parse(' Quiché ')).toBe('quiche');
    expect(searchTermSchema.safeParse('x'.repeat(SEARCH_MAX_LENGTH)).success).toBe(true);
    expect(searchTermSchema.safeParse('x'.repeat(SEARCH_MAX_LENGTH + 1)).success).toBe(false);
  });
});

describe('escapeLikePattern', () => {
  it('makes LIKE wildcards literal', () => {
    expect(escapeLikePattern('100%_a\\b')).toBe('100\\%\\_a\\\\b');
  });

  it('leaves plain text alone', () => {
    expect(escapeLikePattern('jose perez')).toBe('jose perez');
  });
});

describe('formatPlate', () => {
  it('writes a plate with its hyphen and leaves anything else alone', () => {
    expect(formatPlate('C482BTX')).toBe('C-482BTX');
    expect(formatPlate('TC123ABC')).toBe('TC-123ABC');
    expect(formatPlate('raro')).toBe('raro');
  });
});
