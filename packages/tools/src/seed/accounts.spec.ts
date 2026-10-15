import { ensureSignedIn } from './accounts';
import { GatewayError, type Gateway, type Session } from './gateway-client';
import type { Mailbox } from './mailbox';

const SESSION = { accessToken: 't', user: { email: 'a@debus.test' } } as unknown as Session;

function setup(login: jest.Mock) {
  const client = { login, request: jest.fn().mockResolvedValue(undefined) };
  const mailbox = { latestLink: jest.fn() } satisfies Mailbox;
  return {
    client,
    mailbox,
    run: () =>
      ensureSignedIn(client as unknown as Gateway, mailbox, 'a@debus.test', 'clave-demo-1'),
  };
}

describe('ensureSignedIn', () => {
  it('does not touch the mailbox when the login works', async () => {
    const { client, mailbox, run } = setup(jest.fn().mockResolvedValue(SESSION));
    await expect(run()).resolves.toBe(SESSION);
    expect(client.request).not.toHaveBeenCalled();
    expect(mailbox.latestLink).not.toHaveBeenCalled();
  });

  it('sets the password through the emailed link when the account has none', async () => {
    const login = jest
      .fn()
      .mockRejectedValueOnce(new GatewayError(401, 'Correo o contraseña incorrectos.'))
      .mockResolvedValueOnce(SESSION);
    const { client, mailbox, run } = setup(login);
    mailbox.latestLink.mockResolvedValue('/crear-contrasena?token=abc123');
    const before = Date.now();
    await expect(run()).resolves.toBe(SESSION);
    expect(client.request).toHaveBeenNthCalledWith(
      1,
      null,
      'POST',
      '/api/administracion/auth/password/forgot',
      { email: 'a@debus.test' },
    );
    const [to, pattern, since] = mailbox.latestLink.mock.calls[0] as [string, string, Date];
    expect(to).toBe('a@debus.test');
    expect(pattern).toBe('/(?:crear-contrasena|restablecer)');
    expect(since.getTime()).toBeGreaterThanOrEqual(before - 1);
    expect(since.getTime()).toBeLessThanOrEqual(Date.now());
    expect(client.request).toHaveBeenNthCalledWith(
      2,
      null,
      'POST',
      '/api/administracion/auth/password',
      { token: 'abc123', password: 'clave-demo-1' },
    );
    expect(login).toHaveBeenCalledTimes(2);
  });

  it('tells when it had to set the password', async () => {
    const onActivation = jest.fn();
    const login = jest
      .fn()
      .mockRejectedValueOnce(new GatewayError(401, 'no'))
      .mockResolvedValueOnce(SESSION);
    const { client, mailbox } = setup(login);
    mailbox.latestLink.mockResolvedValue('/restablecer?token=abc');
    await ensureSignedIn(client as unknown as Gateway, mailbox, 'a@debus.test', 'x', onActivation);
    expect(onActivation).toHaveBeenCalledTimes(1);
    login.mockResolvedValue(SESSION);
    await ensureSignedIn(client as unknown as Gateway, mailbox, 'a@debus.test', 'x', onActivation);
    expect(onActivation).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a lock', new GatewayError(423, 'Cuenta bloqueada.')],
    ['a network failure', new Error('fetch failed')],
  ])('does not reset the password after %s', async (_label, error) => {
    const { client, run } = setup(jest.fn().mockRejectedValue(error));
    await expect(run()).rejects.toBe(error);
    expect(client.request).not.toHaveBeenCalled();
  });

  it('fails when the link has no token', async () => {
    const login = jest.fn().mockRejectedValue(new GatewayError(401, 'no'));
    const { mailbox, run } = setup(login);
    mailbox.latestLink.mockResolvedValue('/crear-contrasena');
    await expect(run()).rejects.toThrow('token');
  });
});
