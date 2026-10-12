import { PHOTO_MAX_BYTES } from '@debus/contracts';
import { PHOTO_MESSAGE, photoError } from './photo';

const file = (type: string, size = 10) => {
  const made = new File(['x'], 'foto', { type });
  Object.defineProperty(made, 'size', { value: size });
  return made;
};

describe('photoError', () => {
  it.each(['image/jpeg', 'image/png', 'image/webp'])('accepts %s', (type) => {
    expect(photoError(file(type))).toBeUndefined();
  });

  it('accepts a photo of exactly 5 MB', () => {
    expect(photoError(file('image/jpeg', PHOTO_MAX_BYTES))).toBeUndefined();
  });

  it('refuses anything that is not a JPG, PNG or WebP image', () => {
    expect(photoError(file('application/pdf'))).toBe(PHOTO_MESSAGE);
    expect(photoError(file('image/gif'))).toBe(PHOTO_MESSAGE);
  });

  it('refuses a photo over 5 MB with the same text the service uses', () => {
    expect(photoError(file('image/jpeg', PHOTO_MAX_BYTES + 1))).toBe(
      'Sube una foto JPG, PNG o WebP de hasta 5 MB.',
    );
  });
});
