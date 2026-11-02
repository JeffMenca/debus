import { loadGatewayConfig } from './gateway-config';

const urls = {
  SERVICE_URL_ADMINISTRACION: 'http://a',
  SERVICE_URL_FLOTA: 'http://f/',
  SERVICE_URL_VIAJES: 'http://v',
  SERVICE_URL_VENTAS: 'http://ve',
  SERVICE_URL_CLIENTES: 'http://c',
  SERVICE_URL_REPORTES: 'http://r',
  SERVICE_URL_NOTIFICACIONES: 'http://n',
  JWT_PUBLIC_KEY: 'k',
};

describe('loadGatewayConfig', () => {
  it('reads every backend URL without trailing slash', () => {
    const config = loadGatewayConfig({ ...urls, CORS_ORIGINS: 'http://a.com, http://b.com' });

    expect(config).toEqual({
      environment: 'local',
      serviceAuth: 'none',
      jwtPublicKey: 'k',
      docsPassword: null,
      corsOrigins: ['http://a.com', 'http://b.com'],
      serviceUrls: expect.objectContaining({ flota: 'http://f', notificaciones: 'http://n' }),
    });
  });

  it('allows no CORS origins', () => {
    expect(loadGatewayConfig(urls).corsOrigins).toEqual([]);
  });

  it('fails fast when a backend URL is missing', () => {
    const partial: Record<string, string | undefined> = { ...urls };
    delete partial.SERVICE_URL_VENTAS;

    expect(() => loadGatewayConfig(partial)).toThrow('SERVICE_URL_VENTAS is required');
  });

  it('rejects unknown auth modes', () => {
    expect(() => loadGatewayConfig({ ...urls, SERVICE_AUTH: 'basic' })).toThrow();
  });

  it('restores the new lines of the public key', () => {
    const config = loadGatewayConfig({ ...urls, JWT_PUBLIC_KEY: 'a\\nb' });

    expect(config.jwtPublicKey).toBe('a\nb');
  });

  it('requires the public key', () => {
    const partial: Record<string, string | undefined> = { ...urls };
    delete partial.JWT_PUBLIC_KEY;

    expect(() => loadGatewayConfig(partial)).toThrow('JWT_PUBLIC_KEY is required');
  });

  it('leaves the docs open when no password is set outside production', () => {
    expect(loadGatewayConfig(urls).docsPassword).toBeNull();
  });

  it('reads the password of the docs', () => {
    expect(loadGatewayConfig({ ...urls, DOCS_PASSWORD: 'secret' }).docsPassword).toBe('secret');
  });

  it('requires the password of the docs in production', () => {
    expect(() => loadGatewayConfig({ ...urls, DEBUS_ENV: 'production' })).toThrow(
      'DOCS_PASSWORD is required',
    );
    expect(
      loadGatewayConfig({ ...urls, DEBUS_ENV: 'production', DOCS_PASSWORD: 'secret' }).docsPassword,
    ).toBe('secret');
  });
});
