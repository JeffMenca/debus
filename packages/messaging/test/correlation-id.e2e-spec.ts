import { createServer } from 'node:http';
import request from 'supertest';
import { correlationIdFor } from '../src/correlation-id';

describe('correlationIdFor over HTTP', () => {
  const server = createServer((req, res) => {
    res.end(correlationIdFor(req, res));
  });

  it('echoes the incoming id', async () => {
    const response = await request(server).get('/').set('x-correlation-id', 'abc');

    expect(response.text).toBe('abc');
    expect(response.headers['x-correlation-id']).toBe('abc');
  });

  it('creates an id when the caller sends none', async () => {
    const response = await request(server).get('/');

    expect(response.headers['x-correlation-id']).toBe(response.text);
    expect(response.text).toHaveLength(36);
  });
});
