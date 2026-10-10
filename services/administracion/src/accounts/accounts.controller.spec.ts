import { ACCEPTED_MESSAGE } from '@debus/contracts';
import { AccountsController } from './accounts.controller';

const setup = () => {
  const registration = {
    signUp: jest.fn().mockResolvedValue(undefined),
    forgotPassword: jest.fn().mockResolvedValue(undefined),
    linkStatus: jest.fn().mockResolvedValue({ state: 'valid', purpose: 'ACTIVATION' }),
    renewLink: jest.fn().mockResolvedValue(undefined),
    setPassword: jest.fn().mockResolvedValue(undefined),
  };
  return { registration, controller: new AccountsController(registration as never) };
};

describe('AccountsController', () => {
  const signup = {
    fullName: 'Ana',
    email: 'ana@correo.com',
    dpi: '2345678901234',
    phone: '55554444',
  };

  it('answers the same message for sign up, forgotten password and renewal', async () => {
    const { registration, controller } = setup();

    expect(await controller.signUp(signup, 'c')).toEqual({ message: ACCEPTED_MESSAGE });
    expect(await controller.forgot({ email: 'ana@correo.com' }, 'c')).toEqual({
      message: ACCEPTED_MESSAGE,
    });
    expect(await controller.renew({ token: 't' }, 'c')).toEqual({ message: ACCEPTED_MESSAGE });
    expect(registration.signUp).toHaveBeenCalledWith(signup, 'c');
    expect(registration.forgotPassword).toHaveBeenCalledWith('ana@correo.com', 'c');
    expect(registration.renewLink).toHaveBeenCalledWith('t', 'c');
  });

  it('reports the state of a link', async () => {
    const { registration, controller } = setup();

    expect(await controller.status({ token: 't' })).toEqual({
      state: 'valid',
      purpose: 'ACTIVATION',
    });
    expect(registration.linkStatus).toHaveBeenCalledWith('t');
  });

  it('sets the password', async () => {
    const { registration, controller } = setup();

    await controller.setPassword({ token: 't', password: 'clave-segura-1' }, 'c');

    expect(registration.setPassword).toHaveBeenCalledWith(
      { token: 't', password: 'clave-segura-1' },
      'c',
    );
  });
});
