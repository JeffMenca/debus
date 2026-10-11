import { BranchesController } from './branches.controller';

const id = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const actor = { userId: id, role: 'SYSTEM_ADMIN' as const, branchId: null };

describe('BranchesController', () => {
  const setup = () => {
    const branches = {
      list: jest.fn().mockResolvedValue([]),
      get: jest.fn().mockResolvedValue({ id }),
      create: jest.fn().mockResolvedValue({ id }),
      update: jest.fn().mockResolvedValue({ id }),
      setActive: jest.fn().mockResolvedValue(undefined),
    };
    return { branches, controller: new BranchesController(branches as never) };
  };

  it('lists active branches unless inactive ones are requested', async () => {
    const { branches, controller } = setup();

    await controller.list(actor);
    await controller.list(actor, true);

    expect(branches.list).toHaveBeenNthCalledWith(1, actor, false);
    expect(branches.list).toHaveBeenNthCalledWith(2, actor, true);
  });

  it('gets a branch by id', async () => {
    const { branches, controller } = setup();

    expect(await controller.get(actor, id)).toEqual({ id });
    expect(branches.get).toHaveBeenCalledWith(actor, id);
  });

  it('creates a branch on behalf of the caller', async () => {
    const { branches, controller } = setup();
    const body = { code: 'XEL' } as never;

    expect(await controller.create(actor, body, 'c')).toEqual({ id });
    expect(branches.create).toHaveBeenCalledWith(actor, body, 'c');
  });

  it('updates a branch', async () => {
    const { branches, controller } = setup();

    expect(await controller.update(id, { phone: '77610000' }, 'c')).toEqual({ id });
    expect(branches.update).toHaveBeenCalledWith(id, { phone: '77610000' }, 'c');
  });

  it('deactivates and reactivates by id', async () => {
    const { branches, controller } = setup();

    await controller.deactivate(id, 'c');
    await controller.reactivate(id, 'c');

    expect(branches.setActive).toHaveBeenNthCalledWith(1, id, false, 'c');
    expect(branches.setActive).toHaveBeenNthCalledWith(2, id, true, 'c');
  });
});
