import { createEnvelope } from '@debus/contracts';
import { BadRequestException } from '@nestjs/common';
import { decodePushMessage } from './push-message';

const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64');

describe('decodePushMessage', () => {
  it('decodes the base64 envelope of a push request', () => {
    const envelope = createEnvelope('ProbeSent', {}, 'c');

    expect(decodePushMessage({ message: { data: encode(envelope) }, subscription: 's' })).toEqual(
      envelope,
    );
  });

  it.each([
    ['no message', {}],
    ['invalid JSON', { message: { data: Buffer.from('nope').toString('base64') } }],
    ['invalid envelope', { message: { data: encode({ type: 'ProbeSent' }) } }],
  ])('rejects %s', (_case, body) => {
    expect(() => decodePushMessage(body)).toThrow(BadRequestException);
  });
});
