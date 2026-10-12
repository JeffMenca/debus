import { UsersController } from './users.controller';

const id = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

describe('UsersController', () => {
  const setup = () => {
    const users = {
      create: jest.fn().mockResolvedValue({ id }),
      deactivate: jest.fn().mockResolvedValue(undefined),
      reactivate: jest.fn().mockResolvedValue(undefined),
      list: jest.fn().mockResolvedValue({ items: [] }),
      get: jest.fn().mockResolvedValue({ id }),
      update: jest.fn().mockResolvedValue({ id }),
      resendInvitation: jest.fn().mockResolvedValue({ message: 'ok' }),
    };
    return { users, controller: new UsersController(users as never) };
  };

  it('creates users on behalf of the caller', async () => {
    const { users, controller } = setup();
    const actor = { userId: id, role: 'SYSTEM_ADMIN' as const, branchId: null };
    const body = { fullName: 'Luis', email: 'luis@correo.com', role: 'SYSTEM_ADMIN' as const };

    expect(await controller.create(actor, body, 'c')).toEqual({ id });
    expect(users.create).toHaveBeenCalledWith(actor, body, 'c');
  });

  it('deactivates and reactivates by id', async () => {
    const { users, controller } = setup();

    await controller.deactivate(id);
    await controller.reactivate(id);

    expect(users.deactivate).toHaveBeenCalledWith(id);
    expect(users.reactivate).toHaveBeenCalledWith(id);
  });

  it('lists, gets, updates and resends within the caller scope', async () => {
    const { users, controller } = setup();
    const actor = { userId: id, role: 'BRANCH_ADMIN' as const, branchId: id };

    const query = { q: 'ana', page: 1, pageSize: 20 };
    expect(await controller.list(actor, query)).toEqual({ items: [] });
    expect(await controller.get(actor, id)).toEqual({ id });
    expect(await controller.update(id, { fullName: 'Ana Sic' })).toEqual({ id });
    expect(await controller.resendInvitation(actor, id, 'c')).toEqual({ message: 'ok' });

    expect(users.list).toHaveBeenCalledWith(actor, query);
    expect(users.get).toHaveBeenCalledWith(actor, id);
    expect(users.update).toHaveBeenCalledWith(id, { fullName: 'Ana Sic' });
    expect(users.resendInvitation).toHaveBeenCalledWith(actor, id, 'c');
  });
});
