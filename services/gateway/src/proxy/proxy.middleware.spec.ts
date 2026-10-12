import type { NextFunction, Request, Response } from 'express';
import type { GatewayConfig } from '../config/gateway-config';
import type { IdentityTokens } from '@debus/server';
import { ProxyMiddleware } from './proxy.middleware';

const proxyHandler = jest.fn();
jest.mock('http-proxy-middleware', () => ({
  createProxyMiddleware: jest.fn(() => proxyHandler),
  fixRequestBody: jest.fn(),
}));

function setup() {
  const config = { serviceUrls: { flota: 'https://flota' } } as unknown as GatewayConfig;
  const tokens = {
    headersFor: jest.fn().mockResolvedValue({ 'x-serverless-authorization': 'Bearer t' }),
  };
  const middleware = new ProxyMiddleware(config, tokens as unknown as IdentityTokens);
  const json = jest.fn();
  const res = {
    status: jest.fn().mockReturnValue({ json }),
    setHeader: jest.fn(),
  } as unknown as Response;
  return { middleware, tokens, res, json };
}

describe('ProxyMiddleware', () => {
  beforeEach(() => proxyHandler.mockReset());

  it('answers 404 with the common error for unknown or internal paths', async () => {
    const { middleware, res, json } = setup();
    const req = { originalUrl: '/api/flota/events/pubsub', headers: {} } as Request;

    await middleware.use(req, res, jest.fn() as NextFunction);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'No encontramos lo que buscas.' }),
    );
    expect(proxyHandler).not.toHaveBeenCalled();
  });

  it('adds the identity token and hands the request to the proxy', async () => {
    const { middleware, tokens, res } = setup();
    const req = { originalUrl: '/api/flota/buses', headers: {} } as Request;
    const next = jest.fn() as NextFunction;

    await middleware.use(req, res, next);

    expect(tokens.headersFor).toHaveBeenCalledWith('https://flota');
    expect(req.headers['x-serverless-authorization']).toBe('Bearer t');
    expect(req.headers['x-correlation-id']).toEqual(expect.any(String));
    expect(proxyHandler).toHaveBeenCalledWith(req, res, next);
  });
});

describe('ProxyMiddleware upstream errors', () => {
  async function errorHandler() {
    const { createProxyMiddleware } = jest.requireMock<{
      createProxyMiddleware: jest.Mock;
    }>('http-proxy-middleware');
    createProxyMiddleware.mockClear();
    setup();
    const [[options]] = createProxyMiddleware.mock.calls as [
      [{ on: { error: (error: Error, req: unknown, res: unknown) => void } }],
    ];
    return options.on.error;
  }

  it('answers 502 with the common error when the service does not respond', async () => {
    const onError = await errorHandler();
    const end = jest.fn();
    const res = { headersSent: false, writeHead: jest.fn().mockReturnValue({ end }) };

    onError(new Error('ECONNREFUSED'), { headers: { 'x-correlation-id': 'c' } }, res);

    expect(res.writeHead).toHaveBeenCalledWith(502, { 'content-type': 'application/json' });
    expect(JSON.parse(end.mock.calls[0][0])).toMatchObject({ statusCode: 502, correlationId: 'c' });
  });

  it('ignores sockets and responses already sent', async () => {
    const onError = await errorHandler();
    const sent = { headersSent: true, writeHead: jest.fn() };

    onError(new Error('x'), { headers: {} }, {});
    onError(new Error('x'), { headers: {} }, sent);

    expect(sent.writeHead).not.toHaveBeenCalled();
  });
});
