import { loadAuthSettings } from './auth-settings';

describe('auth settings', () => {
  it('restores escaped new lines in the private key', () => {
    const settings = loadAuthSettings({ JWT_PRIVATE_KEY: 'a\\nb', WEB_URL: 'http://w/' });

    expect(settings.privateKey).toBe('a\nb');
    expect(settings.webUrl).toBe('http://w');
  });

  it('defaults the web url only in local', () => {
    expect(loadAuthSettings({ JWT_PRIVATE_KEY: 'k' }).webUrl).toBe('http://localhost:3000');
    expect(() => loadAuthSettings({ JWT_PRIVATE_KEY: 'k', DEBUS_ENV: 'production' })).toThrow(
      'WEB_URL is required',
    );
  });

  it('requires the signing key', () => {
    expect(() => loadAuthSettings({})).toThrow('JWT_PRIVATE_KEY is required');
  });

  it('reads the optional first admin email', () => {
    expect(loadAuthSettings({ JWT_PRIVATE_KEY: 'k' }).bootstrapAdminEmail).toBeNull();
    expect(
      loadAuthSettings({ JWT_PRIVATE_KEY: 'k', BOOTSTRAP_ADMIN_EMAIL: ' Admin@X.com ' })
        .bootstrapAdminEmail,
    ).toBe('admin@x.com');
  });
});
