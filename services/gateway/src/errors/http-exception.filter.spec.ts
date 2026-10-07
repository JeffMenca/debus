import { type ArgumentsHost, BadRequestException, HttpException } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

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
