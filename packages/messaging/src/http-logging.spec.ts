import type { IncomingMessage, ServerResponse } from 'node:http';
import { httpLoggerOptions } from './http-logging';

describe('httpLoggerOptions', () => {
  afterEach(() => {
    delete process.env.LOG_LEVEL;
  });

  it('redacts credentials in requests and cookies in responses', () => {
    const { redact } = httpLoggerOptions();

    expect(redact.paths).toEqual([
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-serverless-authorization"]',
      'res.headers["set-cookie"]',
    ]);
    expect(redact.censor).toBe('[redacted]');
  });

  it('defaults to info and honours LOG_LEVEL', () => {
    expect(httpLoggerOptions().level).toBe('info');

    process.env.LOG_LEVEL = 'warn';

    expect(httpLoggerOptions().level).toBe('warn');
  });

  it('keeps the correlation id generator', () => {
    const req = { headers: { 'x-correlation-id': 'abc' } } as unknown as IncomingMessage;
    const res = { setHeader: jest.fn() } as unknown as ServerResponse;

    expect(httpLoggerOptions().genReqId(req, res)).toBe('abc');
  });
});
