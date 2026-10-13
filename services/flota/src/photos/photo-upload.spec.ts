import { BadRequestException } from '@nestjs/common';
import { DECORATORS } from '@nestjs/swagger';
import { photoDownload, photoFrom } from './photo-upload';

const file = (bytes: Buffer) => ({ buffer: bytes });

describe('photoFrom', () => {
  it('returns the bytes and the type that the bytes show', () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

    expect(photoFrom(file(jpeg))).toEqual({ data: jpeg, contentType: 'image/jpeg' });
  });

  it('refuses a missing file and one that is not an image, with the text of the screen', () => {
    const message = 'Sube una foto JPG, PNG o WebP de hasta 5 MB.';

    expect(() => photoFrom(undefined)).toThrow(new BadRequestException(message));
    expect(() => photoFrom(file(Buffer.from('%PDF-1.7')))).toThrow(
      new BadRequestException(message),
    );
  });
});

describe('photoDownload', () => {
  class Controller {
    @photoDownload()
    handler() {}
  }

  it('documents the image that comes back and the photo that may be missing', () => {
    const responses = Reflect.getMetadata(
      DECORATORS.API_RESPONSE,
      Controller.prototype.handler,
    ) as Record<string, { description: string; content?: Record<string, unknown> }>;

    expect(Object.keys(responses).sort()).toEqual(['200', '404']);
    expect(Object.keys(responses['200']?.content ?? {})).toEqual(['image/*']);
  });
});
