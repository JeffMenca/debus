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

  it('opens the locations of the active branches to a visitor, to GET only', () => {
    const path = '/api/administracion/branches/locations';
    expect(isPublicRoute('GET', path)).toBe(true);
    expect(isPublicRoute('GET', `${path}?page=1&pageSize=100`)).toBe(true);
    expect(isPublicRoute('GET', `${path}/`)).toBe(true);
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']) {
      expect(isPublicRoute(method, path)).toBe(false);
    }
  });

  it('keeps the rest of the branches private', () => {
    expect(isPublicRoute('GET', '/api/administracion/branches')).toBe(false);
    expect(
      isPublicRoute('GET', '/api/administracion/branches/9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d'),
    ).toBe(false);
    expect(isPublicRoute('GET', '/api/administracion/branches/locations/extra')).toBe(false);
    expect(isPublicRoute('GET', '/api/administracion/branches/locations/..%2Fusers')).toBe(false);
    expect(isPublicRoute('GET', '/api/flota/branches/locations')).toBe(false);
    expect(isPublicRoute('POST', '/api/administracion/branches')).toBe(false);
  });

  it('keeps CORS preflights open and protects the system diagnostics', () => {
    expect(isPublicRoute('OPTIONS', '/api/flota/buses')).toBe(true);
    expect(isPublicRoute('OPTIONS', '/api/system/status')).toBe(true);
    expect(isPublicRoute('HEAD', '/api/flota/buses')).toBe(false);
    expect(isPublicRoute('GET', '/api/system/status')).toBe(false);
    expect(isPublicRoute('POST', '/api/system/probes')).toBe(false);
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
  it('asks only for a session on routes without a declared role', () => {
    expect(requiredRoles('/api/flota/buses')).toBeNull();
  });

  it('keeps the system diagnostics for system admins', () => {
    expect(requiredRoles('/api/system/status')).toEqual(['SYSTEM_ADMIN']);
    expect(requiredRoles('/API/System//probes/abc/')).toEqual(['SYSTEM_ADMIN']);
    expect(requiredRoles('/api/system-x')).toBeNull();
  });
});
