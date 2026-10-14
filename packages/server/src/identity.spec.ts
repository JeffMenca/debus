import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiOperation, DECORATORS } from '@nestjs/swagger';
import { Roles, RolesGuard, readIdentity, requireBranch, requireIdentity } from './identity';

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

    expect(operation.description).toBe('Allowed roles: SYSTEM_ADMIN, BRANCH_ADMIN.');
    expect(Object.keys(responses)).toEqual(['401', '403']);
  });
});

describe('requireBranch', () => {
  it('returns the branch of branch staff', () => {
    expect(requireBranch({ userId: 'u', role: 'BRANCH_ADMIN', branchId: 'b' })).toBe('b');
  });
  it('refuses an identity without a branch', () => {
    expect(() => requireBranch({ userId: 'u', role: 'SYSTEM_ADMIN', branchId: null })).toThrow(
      ForbiddenException,
    );
  });
});

describe('Roles on a whole controller', () => {
  @Roles('BRANCH_ADMIN')
  class Controller {
    handler() {}
  }

  it('applies to every route of the class and documents the session errors once', () => {
    const responses = Reflect.getMetadata(DECORATORS.API_RESPONSE, Controller) as Record<
      string,
      unknown
    >;
    const guard = new RolesGuard(new Reflector());
    const ctx = (role: string) =>
      ({
        getHandler: () => Controller.prototype.handler,
        getClass: () => Controller,
        switchToHttp: () => ({
          getRequest: () => ({ headers: { 'x-user-id': userId, 'x-user-role': role } }),
        }),
      }) as unknown as ExecutionContext;

    expect(Object.keys(responses)).toEqual(['401', '403']);
    const operation = Reflect.getMetadata(
      DECORATORS.API_OPERATION,
      Controller.prototype.handler,
    ) as { description?: string } | undefined;
    expect(operation?.description).toBe('Allowed roles: BRANCH_ADMIN.');
    expect(guard.canActivate(ctx('BRANCH_ADMIN'))).toBe(true);
    expect(() => guard.canActivate(ctx('CASHIER'))).toThrow(ForbiddenException);
  });
});

describe('Roles on a controller whose routes describe themselves', () => {
  @Roles('BRANCH_ADMIN')
  class Controller {
    @ApiOperation({ summary: 'Lists buses', description: 'Paged.' })
    list() {}
  }

  it('adds the roles to what the route already says', () => {
    const operation = Reflect.getMetadata(DECORATORS.API_OPERATION, Controller.prototype.list) as {
      summary: string;
      description: string;
    };

    expect(operation).toMatchObject({
      summary: 'Lists buses',
      description: 'Paged. Allowed roles: BRANCH_ADMIN.',
    });
  });
});

describe('Roles on a controller with a route that declares its own', () => {
  @Roles('BRANCH_ADMIN')
  class Controller {
    list() {}

    @Roles('BRANCH_ADMIN', 'DRIVER')
    mine() {}
  }

  const description = (handler: () => void) =>
    (
      Reflect.getMetadata(DECORATORS.API_OPERATION, handler) as {
        description?: string;
      }
    ).description;

  it('keeps the roles of the route over the class ones', () => {
    expect(description(Controller.prototype.list)).toBe('Allowed roles: BRANCH_ADMIN.');
    expect(description(Controller.prototype.mine)).toBe('Allowed roles: BRANCH_ADMIN, DRIVER.');
  });
});
