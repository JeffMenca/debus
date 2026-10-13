import { type AccessTokenClaims, IDENTITY_HEADERS } from '@debus/contracts';
import { correlationIdFor } from '@debus/messaging';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { SERVER_MESSAGES, errorResponse } from '@debus/server';
import { MESSAGES } from '../errors/messages';
import { canonicalPath, isUnderPrefix } from '../routing/canonical-path';
import { AccessTokenVerifier } from './access-token-verifier';
import { isPublicRoute, requiredRoles } from './route-access';

const IDENTITY_HEADER_NAMES = new Set<string>(Object.values(IDENTITY_HEADERS));
// RFC 7235: the scheme is case-insensitive; exactly one space separates it from the token.
const BEARER = /^bearer (\S+)$/i;

// A proxy or a framework may treat `_` as `-`, so x_user_role must never travel either.
function isIdentityHeader(name: string): boolean {
  return IDENTITY_HEADER_NAMES.has(name.toLowerCase().replaceAll('_', '-'));
}

function isApiPath(url: string): boolean {
  return isUnderPrefix(canonicalPath(url), '/api');
}

function sendError(
  res: Response,
  statusCode: number,
  message: string,
  correlationId: string,
): void {
  res.status(statusCode).json(errorResponse(statusCode, message, correlationId));
}

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  constructor(private readonly verifier: AccessTokenVerifier) {}

  use(req: Request, res: Response, next: NextFunction): void {
    // The identity headers are ours to write: whatever the client sent is discarded first.
    for (const header of Object.keys(req.headers)) {
      if (isIdentityHeader(header)) delete req.headers[header];
    }
    if (!req.originalUrl.startsWith('/')) {
      // Absolute-form targets (GET http://host/path) are routed by Express on their own path.
      sendError(res, 400, MESSAGES.badRequest, correlationIdFor(req, res));
      return;
    }
    if (!isApiPath(req.originalUrl) || isPublicRoute(req.method, req.originalUrl)) {
      next();
      return;
    }

    const correlationId = correlationIdFor(req, res);
    const claims = this.verifyBearer(req.headers.authorization);
    if (!claims) {
      sendError(res, 401, SERVER_MESSAGES.sessionEnded, correlationId);
      return;
    }
    const roles = requiredRoles(req.originalUrl);
    if (roles && !roles.includes(claims.role)) {
      sendError(res, 403, SERVER_MESSAGES.forbidden, correlationId);
      return;
    }

    req.headers[IDENTITY_HEADERS.userId] = claims.sub;
    req.headers[IDENTITY_HEADERS.role] = claims.role;
    if (claims.branchId) req.headers[IDENTITY_HEADERS.branchId] = claims.branchId;
    next();
  }

  private verifyBearer(authorization: string | undefined): AccessTokenClaims | null {
    const token = BEARER.exec(authorization ?? '')?.[1];
    return token ? this.verifier.verify(token) : null;
  }
}
