import { BadRequestException } from '@nestjs/common';
import { readIdempotencyKey } from './idempotency';
import { SERVER_MESSAGES } from './messages';

const key = '3f2e4d1c-8b0a-4f8e-9d6c-5b4a3f2e4d1c';

describe('readIdempotencyKey', () => {
  it('takes a uuid', () => {
    expect(readIdempotencyKey(key)).toBe(key);
  });

  it('refuses a missing or malformed key with the shared text', () => {
    for (const raw of [undefined, '', 'abc']) {
      expect(() => readIdempotencyKey(raw)).toThrow(BadRequestException);
      expect(() => readIdempotencyKey(raw)).toThrow(SERVER_MESSAGES.keyMissing);
    }
  });

  it('refuses with the text of the service when it passes its own', () => {
    expect(() => readIdempotencyKey(undefined, 'No pudimos identificar la venta.')).toThrow(
      'No pudimos identificar la venta.',
    );
  });
});
