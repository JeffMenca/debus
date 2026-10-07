import { correlationOf, errorResponse } from './error-response';

describe('errorResponse', () => {
  it('builds the common error body', () => {
    expect(errorResponse(502, 'x', 'c')).toEqual({
      statusCode: 502,
      error: 'Bad Gateway',
      message: 'x',
      correlationId: 'c',
    });
    expect(errorResponse(599, 'x')).toEqual({ statusCode: 599, error: 'Error', message: 'x' });
  });

  it('reads the correlation id from the request', () => {
    expect(correlationOf({ headers: { 'x-correlation-id': 'c' } })).toBe('c');
    expect(correlationOf({ headers: {} })).toBeUndefined();
  });
});
