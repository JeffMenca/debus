import type { NextFunction, Request, Response } from 'express';
import { DOCS_USER, docsBasicAuth } from './docs-auth';

function basic(user: string, password: string): string {
  return `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;
}

function run(authorization?: string): { next: jest.Mock; res: Record<string, jest.Mock> } {
  const res = { status: jest.fn(), set: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  res.set.mockReturnValue(res);
  const next = jest.fn();
  docsBasicAuth('secret')(
    { headers: { authorization } } as Request,
    res as unknown as Response,
    next as NextFunction,
  );
  return { next, res };
}

describe('docsBasicAuth', () => {
  it('lets the request through with the right user and password', () => {
    const { next, res } = run(basic(DOCS_USER, 'secret'));

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('accepts a password that contains a colon', () => {
    const res = { status: jest.fn(), set: jest.fn(), json: jest.fn() };
    const next = jest.fn();

    docsBasicAuth('a:b')(
      { headers: { authorization: basic(DOCS_USER, 'a:b') } } as Request,
      res as unknown as Response,
      next as NextFunction,
    );

    expect(next).toHaveBeenCalled();
  });

  it.each([
    ['no credentials', undefined],
    ['another scheme', 'Bearer abc'],
    ['a wrong password', basic(DOCS_USER, 'nope')],
    ['a wrong user', basic('admin', 'secret')],
    ['no separator', `Basic ${Buffer.from('secret').toString('base64')}`],
    ['an empty password', basic(DOCS_USER, '')],
  ])('asks for credentials again with %s', (_label, authorization) => {
    const { next, res } = run(authorization);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.set).toHaveBeenCalledWith(
      'WWW-Authenticate',
      'Basic realm="debus docs", charset="UTF-8"',
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });
});
