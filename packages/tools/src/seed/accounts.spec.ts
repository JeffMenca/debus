import { ensureSignedIn } from './accounts';
import { GatewayError, type Gateway, type Session } from './gateway-client';
import type { Mailbox } from './mailbox';

const SESSION = { accessToken: 't', user: { email: 'a@debus.test' } } as unknown as Session;

function setup(login: jest.Mock) {
  const client = { login, request: jest.fn().mockResolvedValue(undefined) };
  const mailbox = {
    latestLink: jest.fn(),
    links: jest.fn().mockResolvedValue([]),
  } satisfies Mailbox;
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

  describe('with emails already in the mailbox', () => {
    const unauthorized = () => new GatewayError(401, 'no');

    it('uses a link that is still valid instead of asking for another', async () => {
      const login = jest.fn().mockRejectedValueOnce(unauthorized()).mockResolvedValueOnce(SESSION);
      const { client, mailbox, run } = setup(login);
      mailbox.links.mockResolvedValue([
        '/crear-contrasena?token=new',
        '/crear-contrasena?token=old',
      ]);
      await expect(run()).resolves.toBe(SESSION);
      expect(client.request).toHaveBeenCalledTimes(1);
      expect(client.request).toHaveBeenCalledWith(
        null,
        'POST',
        '/api/administracion/auth/password',
        { token: 'new', password: 'clave-demo-1' },
      );
      expect(mailbox.latestLink).not.toHaveBeenCalled();
      const [to, , since] = mailbox.links.mock.calls[0] as [string, string, Date];
      expect(to).toBe('a@debus.test');
      expect(Math.abs(Date.now() - since.getTime() - 48 * 60 * 60 * 1000)).toBeLessThan(1000);
    });

    it.each([
      ['used', 409],
      ['expired', 410],
      ['unknown', 400],
    ])('goes on to the next link when one is %s', async (_label, status) => {
      const login = jest.fn().mockRejectedValueOnce(unauthorized()).mockResolvedValueOnce(SESSION);
      const { client, mailbox, run } = setup(login);
      mailbox.links.mockResolvedValue(['/restablecer?token=dead', '/crear-contrasena?token=live']);
      client.request.mockRejectedValueOnce(new GatewayError(status, 'enlace'));
      await expect(run()).resolves.toBe(SESSION);
      expect(client.request).toHaveBeenLastCalledWith(
        null,
        'POST',
        '/api/administracion/auth/password',
        { token: 'live', password: 'clave-demo-1' },
      );
    });

    it('asks for a new link when none of them works', async () => {
      const login = jest.fn().mockRejectedValueOnce(unauthorized()).mockResolvedValueOnce(SESSION);
      const { client, mailbox, run } = setup(login);
      mailbox.links.mockResolvedValue(['/restablecer?token=dead']);
      mailbox.latestLink.mockResolvedValue('/crear-contrasena?token=fresh');
      client.request.mockRejectedValueOnce(new GatewayError(410, 'vencido'));
      await expect(run()).resolves.toBe(SESSION);
      expect(client.request).toHaveBeenCalledWith(
        null,
        'POST',
        '/api/administracion/auth/password/forgot',
        { email: 'a@debus.test' },
      );
      expect(client.request).toHaveBeenLastCalledWith(
        null,
        'POST',
        '/api/administracion/auth/password',
        { token: 'fresh', password: 'clave-demo-1' },
      );
    });

    it('stops on an error that is not about the link', async () => {
      const login = jest.fn().mockRejectedValueOnce(unauthorized());
      const { client, mailbox, run } = setup(login);
      mailbox.links.mockResolvedValue(['/restablecer?token=a']);
      const failure = new GatewayError(500, 'boom');
      client.request.mockRejectedValueOnce(failure);
      await expect(run()).rejects.toBe(failure);
    });

    it('tells when it used one', async () => {
      const onActivation = jest.fn();
      const login = jest.fn().mockRejectedValueOnce(unauthorized()).mockResolvedValueOnce(SESSION);
      const { client, mailbox } = setup(login);
      mailbox.links.mockResolvedValue(['/crear-contrasena?token=a']);
      await ensureSignedIn(
        client as unknown as Gateway,
        mailbox,
        'a@debus.test',
        'x',
        onActivation,
      );
      expect(onActivation).toHaveBeenCalledTimes(1);
    });
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
