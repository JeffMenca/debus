import { CategoriesController } from './categories.controller';

const id = 'a1000000-0000-4000-8000-000000000001';

describe('CategoriesController', () => {
  const setup = () => {
    const categories = {
      list: jest.fn().mockResolvedValue({ items: [] }),
      create: jest.fn().mockResolvedValue({ id }),
      update: jest.fn().mockResolvedValue({ id }),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    return { categories, controller: new CategoriesController(categories as never) };
  };

  it('lists the page the query asks for', async () => {
    const { categories, controller } = setup();
    const query = { status: 'all' as const, page: 1, pageSize: 20 };

    expect(await controller.list(query)).toEqual({ items: [] });
    expect(categories.list).toHaveBeenCalledWith(query);
  });

  it('creates, updates and removes by delegating to the service', async () => {
    const { categories, controller } = setup();

    await controller.create({ name: 'Turbo' });
    await controller.update(id, { active: false });
    await controller.remove(id);

    expect(categories.create).toHaveBeenCalledWith({ name: 'Turbo' });
    expect(categories.update).toHaveBeenCalledWith(id, { active: false });
    expect(categories.remove).toHaveBeenCalledWith(id);
  });
});
