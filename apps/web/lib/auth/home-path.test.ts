import { homePathFor, safeNext } from './home-path';

describe('home path', () => {
  it('sends each role to its start page', () => {
    expect(homePathFor('SYSTEM_ADMIN')).toBe('/admin');
    expect(homePathFor('BRANCH_ADMIN')).toBe('/sucursal');
    expect(homePathFor('CASHIER')).toBe('/sucursal');
    expect(homePathFor('DRIVER')).toBe('/sucursal');
    expect(homePathFor('CLIENT')).toBe('/');
  });

  it('only follows internal next paths', () => {
    expect(safeNext('/sucursal/buses')).toBe('/sucursal/buses');
    expect(safeNext('//evil.example')).toBeNull();
    expect(safeNext('https://evil.example')).toBeNull();
    expect(safeNext('/\\evil.example')).toBeNull();
    expect(safeNext('')).toBeNull();
    expect(safeNext(null)).toBeNull();
  });

  it.each([
    ['a tab between the slashes', '/\t/evil.example'],
    ['a line feed between the slashes', '/\n/evil.example'],
    ['a carriage return between the slashes', '/\r/evil.example'],
    ['a tab at the start', '\t//evil.example'],
    ['a space', '/ /evil.example'],
    ['a null character', '/\u0000/evil.example'],
    ['a backslash after the slash', '/\\evil.example'],
    ['a backslash with a tab', '/\\\t/evil.example'],
    ['two slashes', '//evil.example'],
    ['a dot segment that leaves two slashes', '/.//evil.example'],
    ['a dot segment before a backslash', '/./\\evil.example'],
    ['a parent segment that leaves two slashes', '/..//evil.example'],
    ['dot segments repeated', '/a/..//evil.example'],
    ['two slashes and a path', '//evil.example/admin'],
    ['an absolute http address', 'http://evil.example'],
    ['an absolute https address', 'https://evil.example/admin'],
    ['a javascript address', 'javascript:alert(1)'],
    ['a data address', 'data:text/html,hi'],
    ['no leading slash', 'evil.example'],
    ['an empty string', ''],
  ])('rejects %s', (_name, value) => {
    expect(safeNext(value)).toBeNull();
  });

  it('keeps path, query and hash of an internal address', () => {
    expect(safeNext('/sucursal/buses?x=1&y=2#top')).toBe('/sucursal/buses?x=1&y=2#top');
    expect(safeNext('/')).toBe('/');
  });

  it('only returns paths on this site, even when the text is percent-encoded', () => {
    // Still text, not a tab: the browser keeps it inside the path.
    expect(safeNext('/%09/evil.example')).toBe('/%09/evil.example');
    expect(safeNext('/%2F/evil.example')).toBe('/%2F/evil.example');
  });

  it('normalizes dot segments instead of passing them on', () => {
    expect(safeNext('/a/../b')).toBe('/b');
    expect(safeNext('/../../evil.example')).toBe('/evil.example');
  });
});
