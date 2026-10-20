import { replaceBetween } from './markers';

const doc = [
  '# Manual',
  '',
  '<!-- generado:tablas -->',
  'old tables',
  '<!-- /generado:tablas -->',
  '',
  'Texto escrito a mano.',
  '',
  '<!-- generado:eventos -->',
  '<!-- /generado:eventos -->',
  '',
].join('\n');

describe('replaceBetween', () => {
  it('replaces only the block of that marker', () => {
    const result = replaceBetween(doc, 'tablas', 'new tables');

    expect(result).toContain('<!-- generado:tablas -->\nnew tables\n<!-- /generado:tablas -->');
    expect(result).not.toContain('old tables');
    expect(result).toContain('Texto escrito a mano.');
    expect(result).toContain('<!-- generado:eventos -->\n<!-- /generado:eventos -->');
  });

  it('fills an empty block', () => {
    expect(replaceBetween(doc, 'eventos', 'a | b')).toContain(
      '<!-- generado:eventos -->\na | b\n<!-- /generado:eventos -->',
    );
  });

  it('gives the same text when the content does not change', () => {
    const once = replaceBetween(doc, 'tablas', 'same');
    expect(replaceBetween(once, 'tablas', 'same')).toBe(once);
  });

  it('keeps dollar signs of the content as they are', () => {
    expect(replaceBetween(doc, 'tablas', 'cuesta $& y $1')).toContain('cuesta $& y $1');
  });

  it('fails when the opening or the closing marker is missing', () => {
    expect(() => replaceBetween(doc, 'despliegue', 'x')).toThrow('generado:despliegue');
    expect(() => replaceBetween('<!-- generado:tablas -->\nx', 'tablas', 'y')).toThrow(
      '/generado:tablas',
    );
  });

  it('fails when the closing marker comes before the opening one', () => {
    expect(() =>
      replaceBetween('<!-- /generado:tablas -->\n<!-- generado:tablas -->', 'tablas', 'y'),
    ).toThrow('generado:tablas');
  });
});
