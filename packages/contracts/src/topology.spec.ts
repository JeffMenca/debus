import { LOCAL_PORTS, isBackendService, resourceName, serviceUrl } from './topology';

const location = { projectNumber: '123456', region: 'us-central1' };

describe('topology', () => {
  it('adds the staging suffix only in staging', () => {
    expect(resourceName('flota', 'staging')).toBe('flota-staging');
    expect(resourceName('flota', 'production')).toBe('flota');
    expect(resourceName('flota', 'local')).toBe('flota');
  });

  it('builds the deterministic Cloud Run URL per environment', () => {
    expect(serviceUrl('gateway', 'staging', location)).toBe(
      'https://gateway-staging-123456.us-central1.run.app',
    );
    expect(serviceUrl('web', 'production', location)).toBe(
      'https://web-123456.us-central1.run.app',
    );
  });

  it('uses fixed localhost ports in local', () => {
    expect(serviceUrl('flota', 'local')).toBe('http://localhost:4002');
    expect(new Set(Object.values(LOCAL_PORTS)).size).toBe(Object.keys(LOCAL_PORTS).length);
  });

  it('requires a Cloud Run location outside local', () => {
    expect(() => serviceUrl('flota', 'staging')).toThrow('Cloud Run location is required');
  });

  it('recognizes backend services', () => {
    expect(isBackendService('ventas')).toBe(true);
    expect(isBackendService('gateway')).toBe(false);
  });
});
