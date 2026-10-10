import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { DECORATORS } from '@nestjs/swagger';
import { Roles, RolesGuard, readIdentity, requireIdentity } from './identity';

const userId = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

describe('readIdentity', () => {
  it('reads the headers set by the gateway', () => {
    expect(
      readIdentity({ 'x-user-id': userId, 'x-user-role': 'BRANCH_ADMIN', 'x-branch-id': userId }),
    ).toEqual({ userId, role: 'BRANCH_ADMIN', branchId: userId });
    expect(readIdentity({ 'x-user-id': userId, 'x-user-role': 'CLIENT' })).toEqual({
      userId,
      role: 'CLIENT',
      branchId: null,
    });
  });

  it('returns null when headers are missing or malformed', () => {
    expect(readIdentity({})).toBeNull();
    expect(readIdentity({ 'x-user-id': 'nope', 'x-user-role': 'CLIENT' })).toBeNull();
    expect(readIdentity({ 'x-user-id': userId, 'x-user-role': 'KING' })).toBeNull();
  });
});

describe('RolesGuard', () => {
  const context = (headers: Record<string, string>, roles?: string[]) => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(roles),
    } as unknown as Reflector;
    const ctx = {
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => ({ headers }) }),
    } as unknown as ExecutionContext;
    return { guard: new RolesGuard(reflector), ctx };
  };

  it('lets anyone through routes without roles', () => {
    const { guard, ctx } = context({});
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('asks for a session and then for the right role', () => {
    const anonymous = context({}, ['SYSTEM_ADMIN']);
    expect(() => anonymous.guard.canActivate(anonymous.ctx)).toThrow(UnauthorizedException);

    const cashier = context({ 'x-user-id': userId, 'x-user-role': 'CASHIER' }, ['SYSTEM_ADMIN']);
    expect(() => cashier.guard.canActivate(cashier.ctx)).toThrow(ForbiddenException);

    const admin = context({ 'x-user-id': userId, 'x-user-role': 'SYSTEM_ADMIN' }, ['SYSTEM_ADMIN']);
    expect(admin.guard.canActivate(admin.ctx)).toBe(true);
  });
});

describe('requireIdentity', () => {
  const ctx = (headers: Record<string, string>) =>
    ({ switchToHttp: () => ({ getRequest: () => ({ headers }) }) }) as unknown as ExecutionContext;

  it('returns the caller or asks for a session', () => {
    expect(requireIdentity(ctx({ 'x-user-id': userId, 'x-user-role': 'CLIENT' }))).toEqual({
      userId,
      role: 'CLIENT',
      branchId: null,
    });
    expect(() => requireIdentity(ctx({}))).toThrow(UnauthorizedException);
  });
});

describe('Roles', () => {
  class Controller {
    @Roles('SYSTEM_ADMIN', 'BRANCH_ADMIN')
    handler() {}
  }

  it('lets the guard and Swagger read the same list of roles', () => {
    const operation = Reflect.getMetadata(
      DECORATORS.API_OPERATION,
      Controller.prototype.handler,
    ) as { description: string };
    const responses = Reflect.getMetadata(
      DECORATORS.API_RESPONSE,
      Controller.prototype.handler,
    ) as Record<string, unknown>;

    expect(operation.description).toBe('Roles permitidos: SYSTEM_ADMIN, BRANCH_ADMIN.');
    expect(Object.keys(responses)).toEqual(['401', '403']);
  });
});
