import { loadMailSettings, SMTP_TIMEOUT_MS } from './mail-settings';

const timeouts = {
  connectionTimeout: SMTP_TIMEOUT_MS,
  greetingTimeout: SMTP_TIMEOUT_MS,
  socketTimeout: SMTP_TIMEOUT_MS,
};

describe('mail settings', () => {
  it('uses Mailpit without credentials in local', () => {
    expect(loadMailSettings({ DEBUS_ENV: 'local' })).toEqual({
      transport: { host: 'localhost', port: 1025, secure: false, ...timeouts },
      from: 'debus <no-responder@debus.local>',
    });
  });

  it('defaults to local when the environment is not set', () => {
    expect(loadMailSettings({}).transport.host).toBe('localhost');
  });

  it('lets local point at another SMTP host and port', () => {
    expect(loadMailSettings({ SMTP_HOST: 'mail', SMTP_PORT: '2525' }).transport).toEqual({
      host: 'mail',
      port: 2525,
      secure: false,
      ...timeouts,
    });
  });

  it('uses Gmail with the configured account in production', () => {
    expect(
      loadMailSettings({
        DEBUS_ENV: 'production',
        SMTP_USER: 'debus.notificaciones@gmail.com',
        SMTP_PASSWORD: 'abcdefghijklmnop',
      }),
    ).toEqual({
      transport: {
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: { user: 'debus.notificaciones@gmail.com', pass: 'abcdefghijklmnop' },
        ...timeouts,
      },
      from: 'debus <debus.notificaciones@gmail.com>',
    });
  });

  it('gives up on a silent SMTP server well before the inbox transaction ends', () => {
    expect(SMTP_TIMEOUT_MS).toBe(10_000);
  });

  it('refuses to start in production without the account', () => {
    expect(() => loadMailSettings({ DEBUS_ENV: 'production' })).toThrow(
      'SMTP_USER and SMTP_PASSWORD are required',
    );
  });

  it.each([
    ['only the user', { SMTP_USER: 'debus@gmail.com' }],
    ['only the password', { SMTP_PASSWORD: 'abcdefghijklmnop' }],
    ['the user with an empty password', { SMTP_USER: 'debus@gmail.com', SMTP_PASSWORD: '' }],
    ['an empty user with the password', { SMTP_USER: '', SMTP_PASSWORD: 'abcdefghijklmnop' }],
    ['both empty', { SMTP_USER: '', SMTP_PASSWORD: '' }],
  ])('refuses to start in production with %s', (_label, credentials) => {
    expect(() => loadMailSettings({ DEBUS_ENV: 'production', ...credentials })).toThrow(
      'SMTP_USER and SMTP_PASSWORD are required',
    );
  });
});
