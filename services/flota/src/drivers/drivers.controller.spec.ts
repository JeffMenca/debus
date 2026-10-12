import { DriversController } from './drivers.controller';

const id = '2a1b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const branchId = '9b2c7a10-1111-4c4c-8888-123456789abc';
const actor = { userId: id, role: 'BRANCH_ADMIN' as const, branchId };

describe('DriversController', () => {
  const setup = () => {
    const drivers = {
      list: jest.fn().mockResolvedValue({ items: [] }),
      get: jest.fn().mockResolvedValue({ id }),
      create: jest.fn().mockResolvedValue({ id }),
      update: jest.fn().mockResolvedValue({ id }),
      setActive: jest.fn().mockResolvedValue(undefined),
      savePhoto: jest.fn().mockResolvedValue(undefined),
      readPhoto: jest
        .fn()
        .mockResolvedValue({ data: Buffer.from('img'), contentType: 'image/png' }),
    };
    return { drivers, controller: new DriversController(drivers as never) };
  };

  it('works on the branch of the session', async () => {
    const { drivers, controller } = setup();
    const query = { status: 'active' as const, page: 1, pageSize: 20 };
    const body = { fullName: 'Julio' } as never;

    await controller.list(actor, query);
    await controller.get(actor, id);
    await controller.create(actor, body, 'c');
    await controller.update(actor, id, body, 'c');

    expect(drivers.list).toHaveBeenCalledWith(branchId, query);
    expect(drivers.get).toHaveBeenCalledWith(branchId, id);
    expect(drivers.create).toHaveBeenCalledWith(branchId, body, 'c');
    expect(drivers.update).toHaveBeenCalledWith(branchId, id, body, 'c');
  });

  it('refuses a session without a branch', () => {
    const { controller } = setup();

    expect(() => controller.list({ ...actor, branchId: null }, {} as never)).toThrow();
  });

  it('deactivates and reactivates by id', async () => {
    const { drivers, controller } = setup();

    await controller.deactivate(actor, id, 'c');
    await controller.reactivate(actor, id, 'c');

    expect(drivers.setActive).toHaveBeenNthCalledWith(1, branchId, id, false, 'c');
    expect(drivers.setActive).toHaveBeenNthCalledWith(2, branchId, id, true, 'c');
  });

  it('saves a photo checked by its bytes and serves it with a private cache', async () => {
    const { drivers, controller } = setup();
    const file = { buffer: Buffer.from([0xff, 0xd8, 0xff, 1]) };
    const res = { set: jest.fn().mockReturnThis(), send: jest.fn() };

    await controller.savePhoto(actor, id, file);
    await controller.photo(actor, id, res as never);

    expect(drivers.savePhoto).toHaveBeenCalledWith(branchId, id, {
      data: file.buffer,
      contentType: 'image/jpeg',
    });
    expect(() => controller.savePhoto(actor, id, undefined)).toThrow();
    expect(res.set).toHaveBeenCalledWith({
      'content-type': 'image/png',
      'cache-control': 'private, max-age=300',
    });
    expect(res.send).toHaveBeenCalledWith(Buffer.from('img'));
  });
});
