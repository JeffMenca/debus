import { SEED_CLIENTS } from '../clients-catalog';
import { GatewayError } from '../gateway-client';
import { setup } from '../testing/setup';
import { clientSession } from './client-accounts';

const FIRST = SEED_CLIENTS[0]!;
const SIGNUP = '/api/administracion/auth/signup';

describe('clientSession', () => {
  it('registers a new client, sets the password from the emailed link and signs in', async () => {
    const { gateway, ctx } = setup();
    const onActivation = jest.fn();
    const session = await clientSession(ctx, FIRST, onActivation);
    expect(session.user).toMatchObject({ role: 'CLIENT', email: 'seed+cliente-1@debus.local' });
    expect(onActivation).toHaveBeenCalledTimes(1);
    expect(gateway.count('POST', /\/auth\/signup$/)).toBe(1);
    expect(gateway.requests.find((request) => request.path === SIGNUP)?.body).toEqual({
      fullName: FIRST.fullName,
      email: 'seed+cliente-1@debus.local',
      dpi: FIRST.dpi,
      phone: FIRST.phone,
      nit: FIRST.nit,
      address: FIRST.address,
    });
  });

  it('only signs in when the account already works', async () => {
    const { gateway, ctx } = setup();
    await clientSession(ctx, FIRST);
    ctx.clientSessions.clear();
    gateway.requests.length = 0;
    const onActivation = jest.fn();
    await clientSession(ctx, FIRST, onActivation);
    expect(onActivation).not.toHaveBeenCalled();
    expect(gateway.count('POST', /\/auth\/signup$/)).toBe(0);
  });

  it('keeps the session, so asking again costs nothing', async () => {
    const { gateway, ctx } = setup();
    const first = await clientSession(ctx, FIRST);
    gateway.requests.length = 0;
    expect(await clientSession(ctx, FIRST)).toBe(first);
    expect(gateway.requests).toHaveLength(0);
  });

  it('does not hide a failure that is not a missing account', async () => {
    const { gateway, ctx } = setup();
    jest.spyOn(gateway, 'login').mockRejectedValue(new GatewayError(500, 'Algo falló.'));
    await expect(clientSession(ctx, FIRST)).rejects.toMatchObject({ status: 500 });
    expect(gateway.count('POST', /\/auth\/signup$/)).toBe(0);
  });

  it('asks for a reset link when the account is already active with another password', async () => {
    const { gateway, ctx } = setup();
    await gateway.request(null, 'POST', SIGNUP, {
      fullName: FIRST.fullName,
      email: 'seed+cliente-1@debus.local',
      dpi: FIRST.dpi,
      phone: FIRST.phone,
      nit: FIRST.nit,
      address: FIRST.address,
    });
    await gateway.request(null, 'POST', '/api/administracion/auth/password', {
      token: 'seed+cliente-1@debus.local',
      password: 'otra-clave-1',
    });
    gateway.forgot.length = 0;
    const session = await clientSession(ctx, FIRST);
    expect(session.user.email).toBe('seed+cliente-1@debus.local');
    expect(gateway.count('POST', /password\/forgot$/)).toBe(1);
  });

  it('says what happened when no link reaches the mailbox at all', async () => {
    const { gateway, ctx } = setup();
    jest.spyOn(ctx.mailbox, 'latestLink').mockRejectedValue(new Error('No email reached'));
    await expect(clientSession(ctx, FIRST)).rejects.toThrow(
      /seed\+cliente-1@debus\.local.*another password/,
    );
    expect(gateway.count('POST', /password\/forgot$/)).toBe(1);
  });
});
