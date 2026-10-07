import type { GatewayConfig } from '../config/gateway-config';
import { IdentityTokens } from './identity-tokens';

const config = (serviceAuth: 'google' | 'none') => ({ serviceAuth }) as GatewayConfig;

describe('IdentityTokens', () => {
  it('adds nothing when service auth is disabled', async () => {
    const source = { fetchIdToken: jest.fn() };

    await expect(
      new IdentityTokens(config('none'), source).headersFor('https://flota'),
    ).resolves.toEqual({});
    expect(source.fetchIdToken).not.toHaveBeenCalled();
  });

  it('sends a cached identity token in the serverless header', async () => {
    const source = { fetchIdToken: jest.fn().mockResolvedValue('t-1') };
    const tokens = new IdentityTokens(config('google'), source);

    await expect(tokens.headersFor('https://flota', 0)).resolves.toEqual({
      'x-serverless-authorization': 'Bearer t-1',
    });
    await tokens.headersFor('https://flota', 60_000);

    expect(source.fetchIdToken).toHaveBeenCalledTimes(1);
    expect(source.fetchIdToken).toHaveBeenCalledWith('https://flota');
  });

  it('refreshes the token after it expires', async () => {
    const source = {
      fetchIdToken: jest.fn().mockResolvedValueOnce('t-1').mockResolvedValueOnce('t-2'),
    };
    const tokens = new IdentityTokens(config('google'), source);

    await tokens.headersFor('https://flota', 0);

    await expect(tokens.headersFor('https://flota', 46 * 60_000)).resolves.toEqual({
      'x-serverless-authorization': 'Bearer t-2',
    });
  });
});
