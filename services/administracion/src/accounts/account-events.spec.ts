import { AccountEvents } from './account-events';

const payload = {
  userId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  email: 'ana@correo.com',
  fullName: 'Ana',
  reason: 'ALREADY_REGISTERED' as const,
};

describe('AccountEvents', () => {
  const setup = () => {
    const outbox = {
      add: jest.fn().mockResolvedValue({}),
      flush: jest.fn().mockResolvedValue({ published: 1, failed: 0 }),
    };
    return { outbox, events: new AccountEvents(outbox as never) };
  };

  it('writes the event in the caller transaction', async () => {
    const { outbox, events } = setup();
    const tx = {} as never;

    await events.linkIssued(tx, payload, 'c-1');

    expect(outbox.add).toHaveBeenCalledWith(tx, 'EnlaceDeCuentaEmitido', payload, 'c-1');
  });

  it('writes the registration in the caller transaction', async () => {
    const { outbox, events } = setup();
    const tx = {} as never;
    const registered = {
      userId: payload.userId,
      email: payload.email,
      fullName: payload.fullName,
      role: 'CLIENT' as const,
      branchId: null,
      profile: null,
    };

    await events.userRegistered(tx, registered);

    expect(outbox.add).toHaveBeenCalledWith(tx, 'UsuarioRegistrado', registered, undefined);
  });

  it('flushes after the commit', async () => {
    const { outbox, events } = setup();

    await events.flush();

    expect(outbox.flush).toHaveBeenCalled();
  });
});
