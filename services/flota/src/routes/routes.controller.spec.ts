import { RoutesController } from './routes.controller';

const id = '3b2c1d0e-6f5a-4b4c-9d8e-7f6a5b4c3d2e';
const branchId = '9b2c7a10-1111-4c4c-8888-123456789abc';
const actor = { userId: id, role: 'BRANCH_ADMIN' as const, branchId };

describe('RoutesController', () => {
  const setup = () => {
    const routes = {
      list: jest.fn().mockResolvedValue({ items: [] }),
      create: jest.fn().mockResolvedValue({ id }),
      update: jest.fn().mockResolvedValue({ id }),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    return { routes, controller: new RoutesController(routes as never) };
  };

  it('works on the branch of the session', async () => {
    const { routes, controller } = setup();
    const query = { status: 'active' as const, page: 1, pageSize: 20 };
    const body = { distanceKm: 1 } as never;

    await controller.list(actor, query);
    await controller.create(actor, body, 'c');
    await controller.update(actor, id, body, 'c');
    await controller.remove(actor, id, 'c');

    expect(routes.list).toHaveBeenCalledWith(branchId, query);
    expect(routes.create).toHaveBeenCalledWith(branchId, body, 'c');
    expect(routes.update).toHaveBeenCalledWith(branchId, id, body, 'c');
    expect(routes.remove).toHaveBeenCalledWith(branchId, id, 'c');
  });

  it('refuses a session without a branch', () => {
    const { controller } = setup();

    expect(() => controller.list({ ...actor, branchId: null }, {} as never)).toThrow();
  });
});
