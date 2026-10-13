import { type ArgumentsHost, PayloadTooLargeException } from '@nestjs/common';
import { PhotoTooLargeFilter } from './photo-too-large.filter';

describe('PhotoTooLargeFilter', () => {
  it('answers 400 with the text of the screen and the correlation id', () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ headers: { 'x-correlation-id': 'c1' } }),
        getResponse: () => ({ status }),
      }),
    } as unknown as ArgumentsHost;

    new PhotoTooLargeFilter().catch(new PayloadTooLargeException('File too large'), host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Sube una foto JPG, PNG o WebP de hasta 5 MB.',
      correlationId: 'c1',
    });
  });
});
