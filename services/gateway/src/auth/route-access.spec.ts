import { isPublicRoute, requiredRoles } from './route-access';

const ACCESS_PATHS = [
  'signup',
  'login',
  'refresh',
  'logout',
  'password',
  'password/forgot',
  'links/status',
  'links/renew',
];

describe('isPublicRoute', () => {
  it('opens only the access endpoints of administracion', () => {
    for (const path of ACCESS_PATHS) {
      expect(isPublicRoute('POST', `/api/administracion/auth/${path}`)).toBe(true);
    }
    expect(isPublicRoute('GET', '/api/administracion/auth/me')).toBe(false);
    expect(isPublicRoute('GET', '/api/administracion/auth/login')).toBe(false);
    expect(isPublicRoute('POST', '/api/administracion/users')).toBe(false);
    expect(isPublicRoute('POST', '/api/administracion/auth/login/extra')).toBe(false);
  });

  it('opens the access endpoints to POST only', () => {
    for (const method of ['GET', 'HEAD', 'PUT', 'PATCH', 'DELETE', 'TRACE', 'post']) {
      for (const path of ACCESS_PATHS) {
        expect(isPublicRoute(method, `/api/administracion/auth/${path}`)).toBe(false);
      }
    }
  });

  it('ignores the query string, a trailing slash, case and repeated slashes', () => {
    expect(isPublicRoute('POST', '/api/administracion/auth/login/?x=1')).toBe(true);
    expect(isPublicRoute('POST', '/API/Administracion/Auth/Login')).toBe(true);
    expect(isPublicRoute('POST', '//api/administracion//auth/login')).toBe(true);
  });

  it('keeps the diagnostics and CORS preflights open', () => {
    expect(isPublicRoute('GET', '/api/system/status')).toBe(true);
    expect(isPublicRoute('POST', '/api//System/probes')).toBe(true);
    expect(isPublicRoute('OPTIONS', '/api/flota/buses')).toBe(true);
    expect(isPublicRoute('HEAD', '/api/flota/buses')).toBe(false);
  });

  it('protects everything else', () => {
    expect(isPublicRoute('GET', '/api/flota/buses')).toBe(false);
    expect(isPublicRoute('GET', '/api/systems/x')).toBe(false);
    expect(isPublicRoute('GET', '/api/system')).toBe(false);
  });

  it('refuses paths that try to climb out of a public prefix', () => {
    expect(isPublicRoute('POST', '/api/administracion/auth/signup/../users')).toBe(false);
    expect(isPublicRoute('GET', '/api/system/../flota/buses')).toBe(false);
    expect(isPublicRoute('GET', '/api/system/%2e%2e/flota/buses')).toBe(false);
    expect(isPublicRoute('GET', '/api/system/..%2fflota/buses')).toBe(false);
    expect(isPublicRoute('POST', '/api/administracion/auth%2flogin')).toBe(false);
    expect(isPublicRoute('GET', '/api/system/x\\..\\flota')).toBe(false);
  });
});

describe('requiredRoles', () => {
  it('asks only for a session until a prefix declares roles', () => {
    expect(requiredRoles('/api/flota/buses')).toBeNull();
  });
});
