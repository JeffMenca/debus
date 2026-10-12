import type { GatewayConfig } from '../config/gateway-config';
import type { IdentityTokens } from '@debus/server';
import { ServiceClient } from './service-client';

describe('ServiceClient', () => {
  it('calls the service with identity and correlation headers and a timeout', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('{}'));
    const config = { serviceUrls: { flota: 'https://flota' } } as unknown as GatewayConfig;
    const tokens = {
      headersFor: jest.fn().mockResolvedValue({ 'x-serverless-authorization': 'Bearer t' }),
    };

    await new ServiceClient(config, tokens as unknown as IdentityTokens).get(
      'flota',
      '/health',
      'c-1',
    );

    expect(tokens.headersFor).toHaveBeenCalledWith('https://flota');
    expect(fetchMock).toHaveBeenCalledWith('https://flota/health', {
      headers: { 'x-serverless-authorization': 'Bearer t', 'x-correlation-id': 'c-1' },
      signal: expect.any(AbortSignal),
    });
    fetchMock.mockRestore();
  });
});
