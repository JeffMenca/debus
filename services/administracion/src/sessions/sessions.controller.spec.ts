import { SessionsController } from './sessions.controller';

const id = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

describe('SessionsController', () => {
  const setup = () => {
    const sessions = {
      login: jest.fn().mockResolvedValue({ accessToken: 'a' }),
      refresh: jest.fn().mockResolvedValue({ accessToken: 'b' }),
      logout: jest.fn().mockResolvedValue(undefined),
      me: jest.fn().mockResolvedValue({ id }),
    };
    return { sessions, controller: new SessionsController(sessions as never) };
  };

  it('delegates login, refresh and logout', async () => {
    const { sessions, controller } = setup();

    expect(await controller.login({ email: 'a@b.com', password: 'x' })).toEqual({
      accessToken: 'a',
    });
    expect(await controller.refresh({ refreshToken: 'r' })).toEqual({ accessToken: 'b' });
    await controller.logout({ refreshToken: 'r' });
    expect(sessions.login).toHaveBeenCalledWith({ email: 'a@b.com', password: 'x' });
    expect(sessions.refresh).toHaveBeenCalledWith('r');
    expect(sessions.logout).toHaveBeenCalledWith('r');
  });

  it('answers me for the identity the gateway sent', async () => {
    const { sessions, controller } = setup();

    await controller.me({ userId: id, role: 'CLIENT', branchId: null });

    expect(sessions.me).toHaveBeenCalledWith(id);
  });
});
