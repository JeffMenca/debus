import { BusesController } from './buses.controller';

const id = '1f0e2d3c-4b5a-4968-8776-655443322110';
const branchId = '9b2c7a10-1111-4c4c-8888-123456789abc';
const actor = { userId: id, role: 'BRANCH_ADMIN' as const, branchId };

describe('BusesController', () => {
  const setup = () => {
    const buses = {
      list: jest.fn().mockResolvedValue({ items: [] }),
      get: jest.fn().mockResolvedValue({ id }),
      create: jest.fn().mockResolvedValue({ id }),
      update: jest.fn().mockResolvedValue({ id }),
      setActive: jest.fn().mockResolvedValue(undefined),
      savePhoto: jest.fn().mockResolvedValue(undefined),
      readPhoto: jest
        .fn()
        .mockResolvedValue({ data: Buffer.from('img'), contentType: 'image/jpeg' }),
    };
    return { buses, controller: new BusesController(buses as never) };
  };

  it('works on the branch of the session', async () => {
    const { buses, controller } = setup();
    const query = { status: 'all' as const, page: 1, pageSize: 20 };
    const body = { plate: 'C482BTX' } as never;

    await controller.list(actor, query);
    await controller.get(actor, id);
    await controller.create(actor, body, 'c');
    await controller.update(actor, id, body, 'c');

    expect(buses.list).toHaveBeenCalledWith(branchId, query);
    expect(buses.get).toHaveBeenCalledWith(branchId, id);
    expect(buses.create).toHaveBeenCalledWith(branchId, body, 'c');
    expect(buses.update).toHaveBeenCalledWith(branchId, id, body, 'c');
  });

  it('refuses a session without a branch', () => {
    const { controller } = setup();

    expect(() => controller.list({ ...actor, branchId: null }, {} as never)).toThrow();
  });

  it('deactivates and reactivates by id', async () => {
    const { buses, controller } = setup();

    await controller.deactivate(actor, id, 'c');
    await controller.reactivate(actor, id, 'c');

    expect(buses.setActive).toHaveBeenNthCalledWith(1, branchId, id, false, 'c');
    expect(buses.setActive).toHaveBeenNthCalledWith(2, branchId, id, true, 'c');
  });

  it('saves a photo checked by its bytes', async () => {
    const { buses, controller } = setup();
    const file = { buffer: Buffer.from([0xff, 0xd8, 0xff, 1]) };

    await controller.savePhoto(actor, id, file);

    expect(buses.savePhoto).toHaveBeenCalledWith(branchId, id, {
      data: file.buffer,
      contentType: 'image/jpeg',
    });
    expect(() => controller.savePhoto(actor, id, undefined)).toThrow();
  });

  it('serves the photo with a private cache', async () => {
    const { controller } = setup();
    const res = { set: jest.fn().mockReturnThis(), send: jest.fn() };

    await controller.photo(actor, id, res as never);

    expect(res.set).toHaveBeenCalledWith({
      'content-type': 'image/jpeg',
      'cache-control': 'private, max-age=300',
    });
    expect(res.send).toHaveBeenCalledWith(Buffer.from('img'));
  });
});
