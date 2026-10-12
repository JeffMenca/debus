import { IDENTITY_HEADERS, USER_ROLES, type UserRole } from '@debus/contracts';
import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  applyDecorators,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiOperation, DECORATORS } from '@nestjs/swagger';
import { z } from 'zod';
import { apiErrors } from './api-docs';
import { SERVER_MESSAGES } from './messages';

export interface Identity {
  userId: string;
  role: UserRole;
  branchId: string | null;
}

type Headers = Record<string, string | string[] | undefined>;
const ROLES_KEY = 'roles';
const identitySchema = z.object({
  userId: z.uuid(),
  role: z.enum(USER_ROLES),
  branchId: z.uuid().nullable(),
});

function header(headers: Headers, name: string): string | undefined {
  const value = headers[name];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

export function readIdentity(headers: Headers): Identity | null {
  const parsed = identitySchema.safeParse({
    userId: header(headers, IDENTITY_HEADERS.userId),
    role: header(headers, IDENTITY_HEADERS.role),
    branchId: header(headers, IDENTITY_HEADERS.branchId) ?? null,
  });
  return parsed.success ? parsed.data : null;
}

export function requireIdentity(context: ExecutionContext): Identity {
  const identity = readIdentity(context.switchToHttp().getRequest<{ headers: Headers }>().headers);
  if (!identity) throw new UnauthorizedException(SERVER_MESSAGES.signInRequired);
  return identity;
}

export const CurrentIdentity = createParamDecorator((_: unknown, context: ExecutionContext) =>
  requireIdentity(context),
);

// Branch staff work only on their own branch; the gateway puts it in the identity headers.
export function requireBranch(identity: Identity): string {
  if (!identity.branchId) throw new ForbiddenException(SERVER_MESSAGES.forbidden);
  return identity.branchId;
}

const allowedRoles = (roles: UserRole[]) => `Allowed roles: ${roles.join(', ')}.`;

// On a whole controller every route gets the roles in its description, after what it already says.
// Method decorators run before the class one, so their descriptions are there to be kept.
function describeRoutes(controller: { prototype: object }, roles: UserRole[]): void {
  const { prototype } = controller;
  for (const name of Object.getOwnPropertyNames(prototype)) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
    if (name === 'constructor' || typeof descriptor?.value !== 'function') continue;
    const current = Reflect.getMetadata(DECORATORS.API_OPERATION, descriptor.value) as
      { description?: string } | undefined;
    const description = [current?.description, allowedRoles(roles)].filter(Boolean).join(' ');
    ApiOperation({ ...current, description })(prototype, name, descriptor);
  }
}

// The same list feeds the guard and the Swagger description, so the docs cannot drift.
export const Roles = (...roles: UserRole[]) => {
  const onRoute = applyDecorators(
    SetMetadata(ROLES_KEY, roles),
    ApiOperation({ description: allowedRoles(roles) }),
    apiErrors(401, 403),
  );
  const onClass = applyDecorators(SetMetadata(ROLES_KEY, roles), apiErrors(401, 403));
  return (target: object, key?: string | symbol, descriptor?: PropertyDescriptor): void => {
    if (descriptor) return onRoute(target, key, descriptor);
    onClass(target);
    describeRoutes(target as { prototype: object }, roles);
  };
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles) return true;
    if (!roles.includes(requireIdentity(context).role)) {
      throw new ForbiddenException(SERVER_MESSAGES.forbidden);
    }
    return true;
  }
}
