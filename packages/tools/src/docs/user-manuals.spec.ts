import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const MANUALS = join(__dirname, '../../../../docs/manuales');
const FILES = ['usuario-clientes.md', 'usuario-personal.md'];
const PRODUCTION_URL = 'https://web-169401355798.us-central1.run.app/';
const MAX_IMAGE_BYTES = 400 * 1024;

const read = (file: string): string => readFileSync(join(MANUALS, file), 'utf8');
const imagesOf = (markdown: string): string[] =>
  [...markdown.matchAll(/!\[[^\]]*\]\((img\/[^)]+)\)/g)].map((match) => match[1]!);
const captures = (): string[] =>
  ['clientes', 'personal'].flatMap((group) =>
    readdirSync(join(MANUALS, 'img', group)).map((file) => `img/${group}/${file}`),
  );

describe('user manuals', () => {
  it.each(FILES)('%s exists and tells where the application is', (file) => {
    expect(existsSync(join(MANUALS, file))).toBe(true);
    expect(read(file)).toContain(PRODUCTION_URL);
  });

  it.each(FILES)('every image of %s exists', (file) => {
    const images = imagesOf(read(file));
    expect(images.length).toBeGreaterThan(0);
    expect(images.filter((image) => !existsSync(join(MANUALS, image)))).toEqual([]);
  });

  it('no capture is left without use', () => {
    const used = new Set(FILES.flatMap((file) => imagesOf(read(file))));
    expect(captures().filter((capture) => !used.has(capture))).toEqual([]);
  });

  it('every capture stays light', () => {
    expect(
      captures().filter((capture) => statSync(join(MANUALS, capture)).size >= MAX_IMAGE_BYTES),
    ).toEqual([]);
  });

  it.each(FILES)('%s names no real account', (file) => {
    expect(read(file)).not.toMatch(/[\w.+-]+@(?!correo\.com)[\w-]+\.\w+/);
  });
});
