import type { IncomingMessage, ServerResponse } from 'node:http';
import { correlationIdFor } from './correlation-id';

function fakes(header?: string) {
  const req = { headers: header ? { 'x-correlation-id': header } : {} } as IncomingMessage;
  const res = { setHeader: jest.fn() } as unknown as ServerResponse;
  return { req, res };
}

describe('correlationIdFor', () => {
  it('reuses the incoming id and echoes it back', () => {
    const { req, res } = fakes('abc');

    expect(correlationIdFor(req, res)).toBe('abc');
    expect(res.setHeader).toHaveBeenCalledWith('x-correlation-id', 'abc');
  });

  it('creates an id when missing and stores it on the request', () => {
    const { req, res } = fakes();

    const id = correlationIdFor(req, res);

    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(req.headers['x-correlation-id']).toBe(id);
    expect(correlationIdFor(req, res)).toBe(id);
  });
});
