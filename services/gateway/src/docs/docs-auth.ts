import { createHash, timingSafeEqual } from 'node:crypto';
import { errorResponse } from '@debus/server';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { MESSAGES } from '../errors/messages';

export const DOCS_USER = 'debus';

const BASIC = /^basic (\S+)$/i;

// Hashing first gives both sides the same length, which timingSafeEqual requires.
function sameText(a: string, b: string): boolean {
  const digest = (value: string): Buffer => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(a), digest(b));
}

function credentialsOf(authorization: string | undefined): { user: string; password: string } {
  const encoded = BASIC.exec(authorization ?? '')?.[1] ?? '';
  const decoded = Buffer.from(encoded, 'base64').toString('utf8');
  const separator = decoded.indexOf(':');
  return separator < 0
    ? { user: '', password: '' }
    : { user: decoded.slice(0, separator), password: decoded.slice(separator + 1) };
}

export function docsBasicAuth(password: string): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const given = credentialsOf(req.headers.authorization);
    // Both comparisons always run so the answer does not reveal which one failed.
    const userMatches = sameText(given.user, DOCS_USER);
    const passwordMatches = sameText(given.password, password);
    if (userMatches && passwordMatches && given.password !== '') {
      next();
      return;
    }
    res
      .status(401)
      .set('WWW-Authenticate', 'Basic realm="debus docs", charset="UTF-8"')
      .json(errorResponse(401, MESSAGES.docsCredentials));
  };
}
