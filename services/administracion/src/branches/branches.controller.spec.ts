import { BranchesController } from './branches.controller';

const id = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const actor = { userId: id, role: 'SYSTEM_ADMIN' as const, branchId: null };

describe('BranchesController', () => {
  const setup = () => {
    const branches = {
      list: jest.fn().mockResolvedValue({ items: [] }),
      locations: jest.fn().mockResolvedValue({ items: [] }),
      get: jest.fn().mockResolvedValue({ id }),
      create: jest.fn().mockResolvedValue({ id }),
      update: jest.fn().mockResolvedValue({ id }),
      setActive: jest.fn().mockResolvedValue(undefined),
    };
    return { branches, controller: new BranchesController(branches as never) };
  };

  it('lists the page the query asks for', async () => {
    const { branches, controller } = setup();
    const query = { status: 'all' as const, q: 'peten', page: 2, pageSize: 20 };

    expect(await controller.list(actor, query)).toEqual({ items: [] });
    expect(branches.list).toHaveBeenCalledWith(actor, query);
  });

  it('lists the locations of the active branches for anybody', async () => {
    const { branches, controller } = setup();
    const query = { page: 1, pageSize: 100 };

    expect(await controller.locations(query)).toEqual({ items: [] });
    expect(branches.locations).toHaveBeenCalledWith(query);
  });

  it('lets the browser keep the locations for five minutes', () => {
    const headers = Reflect.getMetadata('__headers__', BranchesController.prototype.locations);
    expect(headers).toContainEqual({ name: 'Cache-Control', value: 'public, max-age=300' });
  });

  it('declares the locations before the route of an id, so "locations" is not read as one', () => {
    const names = Object.getOwnPropertyNames(BranchesController.prototype);
    expect(names.indexOf('locations')).toBeLessThan(names.indexOf('get'));
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
