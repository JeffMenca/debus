import { ApiError, FRIENDLY_NETWORK_MESSAGE, apiErrorFrom, messageOf } from './api-error';

describe('messageOf', () => {
  it('keeps the message of API errors', () => {
    expect(messageOf(new ApiError(401, 'Tu sesión terminó.'))).toBe('Tu sesión terminó.');
  });

  it('hides anything unexpected behind the friendly message', () => {
    expect(messageOf(new TypeError('boom'))).toBe(FRIENDLY_NETWORK_MESSAGE);
    expect(messageOf(null)).toBe(FRIENDLY_NETWORK_MESSAGE);
  });
});

describe('apiErrorFrom', () => {
  it('keeps the message of the real locked-account body, which has no error field', () => {
    const error = apiErrorFrom(423, {
      statusCode: 423,
      message: 'Por seguridad bloqueamos tu cuenta 15 minutos.',
    });

    expect(error.status).toBe(423);
    expect(error.message).toBe('Por seguridad bloqueamos tu cuenta 15 minutos.');
  });

  it('keeps the correlation id when there is one', () => {
    expect(
      apiErrorFrom(502, { message: 'Sin respuesta.', correlationId: 'c-1' }).correlationId,
    ).toBe('c-1');
  });

  it.each([null, 'plain text', { statusCode: 500 }, { message: '' }, { message: 42 }])(
    'falls back to the connection message for %j',
    (body) => {
      expect(apiErrorFrom(500, body).message).toBe(FRIENDLY_NETWORK_MESSAGE);
    },
  );
});
