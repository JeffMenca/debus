import { AuthMiddleware } from './auth.middleware';
import { requiredRoles } from './route-access';

jest.mock('./route-access', () => ({
  ...jest.requireActual('./route-access'),
  requiredRoles: jest.fn().mockReturnValue(null),
}));

const sub = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const branch = '9b2c7a10-1111-4c4c-8888-123456789abc';

interface FakeRequest {
  method: string;
  originalUrl: string;
  headers: Record<string, string>;
}

function run(req: FakeRequest, claims: unknown = null) {
  const verifier = { verify: jest.fn().mockReturnValue(claims) };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn(), setHeader: jest.fn() };
  const next = jest.fn();
  new AuthMiddleware(verifier as never).use(req as never, res as never, next);
  return { verifier, res, next, req };
}

const forged = { 'x-user-id': sub, 'x-user-role': 'SYSTEM_ADMIN', 'x-branch-id': branch };

describe('AuthMiddleware', () => {
  afterEach(() => jest.mocked(requiredRoles).mockReturnValue(null));

  it('drops identity headers forged by the client on public routes', () => {
    const { next, req, verifier } = run({
      method: 'POST',
      originalUrl: '/api/administracion/auth/login',
      headers: { ...forged },
    });

    expect(next).toHaveBeenCalled();
    expect(verifier.verify).not.toHaveBeenCalled();
    expect(req.headers).not.toHaveProperty('x-user-id');
    expect(req.headers).not.toHaveProperty('x-user-role');
    expect(req.headers).not.toHaveProperty('x-branch-id');
  });

  it('drops identity headers outside the API too', () => {
    const { next, req } = run({ method: 'GET', originalUrl: '/health', headers: { ...forged } });

    expect(next).toHaveBeenCalled();
    expect(req.headers).toEqual({});
  });

  it('does not let case or repeated slashes turn a protected route into a public one', () => {
    for (const originalUrl of ['//API/Administracion//users', '/Api/administracion/users/']) {
      const { next, res } = run({ method: 'POST', originalUrl, headers: { ...forged } });

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    }
  });

  it('asks for a session on protected routes', () => {
    const { next, res } = run({
      method: 'GET',
      originalUrl: '/api/flota/buses',
      headers: { ...forged },
    });

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 401,
        message: 'Tu sesión terminó. Inicia sesión de nuevo.',
      }),
    );
  });

  it('rejects an invalid token and non bearer schemes', () => {
    for (const authorization of ['Bearer x', 'Basic abc', 'Bearer', '']) {
      const { res, next } = run({
        method: 'GET',
        originalUrl: '/api/flota/buses',
        headers: { authorization },
      });

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    }
  });

  it('never accepts a valid token under another scheme', () => {
    for (const scheme of ['Basic', 'Token', 'Bearer2', 'Digest']) {
      const { res, next, verifier } = run(
        {
          method: 'GET',
          originalUrl: '/api/flota/buses',
          headers: { authorization: `${scheme} good` },
        },
        { sub, role: 'CASHIER', branchId: branch },
      );

      expect(verifier.verify).not.toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    }
  });

  it('accepts the bearer scheme in any case', () => {
    for (const scheme of ['Bearer', 'bearer', 'BEARER', 'bEaReR']) {
      const { next, verifier } = run(
        {
          method: 'GET',
          originalUrl: '/api/flota/buses',
          headers: { authorization: `${scheme} good` },
        },
        { sub, role: 'CASHIER', branchId: branch },
      );

      expect(verifier.verify).toHaveBeenCalledWith('good');
      expect(next).toHaveBeenCalled();
    }
  });

  it('rejects an authorization header with extra spaces or parts', () => {
    for (const authorization of [
      'Bearer  good',
      'Bearer good ',
      ' Bearer good',
      'Bearer\tgood',
      'Bearer good extra',
    ]) {
      const { res, next, verifier } = run(
        { method: 'GET', originalUrl: '/api/flota/buses', headers: { authorization } },
        { sub, role: 'CASHIER', branchId: branch },
      );

      expect(verifier.verify).not.toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    }
  });

  it('drops identity headers written with underscores or any casing', () => {
    const { req } = run({
      method: 'POST',
      originalUrl: '/api/administracion/auth/login',
      headers: {
        x_user_id: sub,
        x_user_role: 'SYSTEM_ADMIN',
        x_branch_id: branch,
        'X_User-Role': 'SYSTEM_ADMIN',
        'x-user_id': sub,
        accept: 'application/json',
      },
    });

    expect(req.headers).toEqual({ accept: 'application/json' });
  });

  it('refuses requests in absolute form instead of guessing their path', () => {
    for (const originalUrl of [
      'http://gateway.test/api/flota/buses',
      'HTTP://gateway.test/health',
      'https://gateway.test/api/administracion/users',
      '*',
    ]) {
      const { next, res, verifier } = run({
        method: 'GET',
        originalUrl,
        headers: { ...forged },
      });

      expect(next).not.toHaveBeenCalled();
      expect(verifier.verify).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    }
  });

  it('forwards the verified identity and ignores forged headers', () => {
    const { next, req, verifier } = run(
      {
        method: 'GET',
        originalUrl: '/api/flota/buses',
        headers: { authorization: 'Bearer good', ...forged },
      },
      { sub, role: 'CASHIER', branchId: branch },
    );

    expect(verifier.verify).toHaveBeenCalledWith('good');
    expect(next).toHaveBeenCalled();
    expect(req.headers).toMatchObject({
      'x-user-id': sub,
      'x-user-role': 'CASHIER',
      'x-branch-id': branch,
    });
  });

  it('omits the branch header for users without a branch', () => {
    const { req } = run(
      {
        method: 'GET',
        originalUrl: '/api/clientes/perfil',
        headers: { authorization: 'Bearer good', 'x-branch-id': branch },
      },
      { sub, role: 'CLIENT', branchId: null },
    );

    expect(req.headers).not.toHaveProperty('x-branch-id');
  });

  it('answers 403 when the route requires another role', () => {
    jest.mocked(requiredRoles).mockReturnValue(['SYSTEM_ADMIN']);

    const { next, res } = run(
      { method: 'GET', originalUrl: '/api/x', headers: { authorization: 'Bearer good' } },
      { sub, role: 'CLIENT', branchId: null },
    );

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'No tienes permiso para ver esto.' }),
    );
  });

  it('lets a user with the required role through', () => {
    jest.mocked(requiredRoles).mockReturnValue(['SYSTEM_ADMIN']);

    const { next } = run(
      { method: 'GET', originalUrl: '/api/x', headers: { authorization: 'Bearer good' } },
      { sub, role: 'SYSTEM_ADMIN', branchId: null },
    );

    expect(next).toHaveBeenCalled();
  });
});
