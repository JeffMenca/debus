import { type ArgumentsHost, BadRequestException, HttpException } from '@nestjs/common';
import { HttpExceptionFilter, correlationOf, errorResponse } from './errors';
import { SERVER_MESSAGES } from './messages';

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

function host() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const arg = {
    switchToHttp: () => ({
      getRequest: () => ({ headers: { 'x-correlation-id': 'c' } }),
      getResponse: () => ({ status }),
    }),
  } as unknown as ArgumentsHost;
  return { arg, status, json };
}

describe('HttpExceptionFilter', () => {
  it('keeps the message of client errors', () => {
    const { arg, status, json } = host();

    new HttpExceptionFilter().catch(
      new BadRequestException('Validation failed (uuid is expected)'),
      arg,
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Validation failed (uuid is expected)',
      correlationId: 'c',
    });
  });

  it('joins validation messages and accepts plain string bodies', () => {
    const { arg, json } = host();
    const filter = new HttpExceptionFilter();

    filter.catch(new BadRequestException(['a is required', 'b is required']), arg);
    filter.catch(new HttpException('Too many', 429), arg);

    expect(json).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ message: 'a is required. b is required' }),
    );
    expect(json).toHaveBeenNthCalledWith(2, expect.objectContaining({ message: 'Too many' }));
  });

  it('hides internal details behind a friendly message', () => {
    const { arg, status, json } = host();

    new HttpExceptionFilter().catch(new Error('db password leaked'), arg);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Algo salió mal. Intenta de nuevo en unos segundos.' }),
    );
  });
});

function hostWith(req: unknown, res: unknown): ArgumentsHost {
  return {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ArgumentsHost;
}

describe('HttpExceptionFilter with the shared texts', () => {
  it('answers a zod pipe rejection with the shared Spanish text and the correlation id', () => {
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const host = hostWith({ headers: { 'x-correlation-id': 'c1' } }, res);
    new HttpExceptionFilter().catch(new BadRequestException(SERVER_MESSAGES.invalidData), host);
    expect(res.json).toHaveBeenCalledWith({
      statusCode: 400,
      error: 'Bad Request',
      message: SERVER_MESSAGES.invalidData,
      correlationId: 'c1',
    });
  });
});
