import { imageTypeOf } from './image-type';

const bytes = (...values: number[]) => Buffer.from([...values, 0, 0, 0, 0, 0, 0, 0, 0]);

describe('imageTypeOf', () => {
  it('recognises JPEG, PNG and WebP by their first bytes', () => {
    expect(imageTypeOf(bytes(0xff, 0xd8, 0xff))).toBe('image/jpeg');
    expect(imageTypeOf(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('image/png');
    expect(imageTypeOf(Buffer.from('RIFF0000WEBPVP8 '))).toBe('image/webp');
  });
  it('refuses anything else, whatever the file is called', () => {
    expect(imageTypeOf(Buffer.from('%PDF-1.7'))).toBeNull();
    expect(imageTypeOf(Buffer.alloc(2))).toBeNull();
  });
});
