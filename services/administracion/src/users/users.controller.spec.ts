import { UsersController } from './users.controller';

const id = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

describe('UsersController', () => {
  const setup = () => {
    const users = {
      create: jest.fn().mockResolvedValue({ id }),
      deactivate: jest.fn().mockResolvedValue(undefined),
      reactivate: jest.fn().mockResolvedValue(undefined),
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
});
