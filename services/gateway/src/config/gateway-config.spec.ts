import { loadGatewayConfig } from './gateway-config';

const urls = {
  SERVICE_URL_ADMINISTRACION: 'http://a',
  SERVICE_URL_FLOTA: 'http://f/',
  SERVICE_URL_VIAJES: 'http://v',
  SERVICE_URL_VENTAS: 'http://ve',
  SERVICE_URL_CLIENTES: 'http://c',
  SERVICE_URL_REPORTES: 'http://r',
  SERVICE_URL_NOTIFICACIONES: 'http://n',
};

describe('loadGatewayConfig', () => {
  it('reads every backend URL without trailing slash', () => {
    const config = loadGatewayConfig({ ...urls, CORS_ORIGINS: 'http://a.com, http://b.com' });

    expect(config).toEqual({
      environment: 'local',
      serviceAuth: 'none',
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
});
