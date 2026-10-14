import { ConflictException, NotFoundException } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { EXPENSE_MESSAGES } from './expense-messages';

const row = {
  id: 'a1000000-0000-4000-8000-000000000001',
  name: 'Llantas',
  active: true,
  searchText: 'llantas',
  createdAt: new Date(),
  updatedAt: new Date(),
  _count: { lines: 0 },
};
const prismaError = (code: string) => Object.assign(new Error(code), { code });

const setup = () => {
  const category = {
    findMany: jest.fn().mockResolvedValue([row, { ...row, id: 'b', _count: { lines: 3 } }]),
    count: jest.fn().mockResolvedValue(2),
    create: jest.fn().mockResolvedValue(row),
    update: jest.fn().mockResolvedValue(row),
    delete: jest.fn().mockResolvedValue(row),
  };
  const prisma = {
    expenseCategory: category,
    $transaction: jest.fn((queries: Promise<unknown>[]) => Promise.all(queries)),
  };
  return { category, prisma, service: new CategoriesService(prisma as never) };
};

describe('CategoriesService', () => {
  it('lists a page by name, with the id as tie breaker, and marks the categories in use', async () => {
    const { category, service } = setup();

    const page = await service.list({ status: 'active', page: 2, pageSize: 5 });

    expect(category.findMany).toHaveBeenCalledWith({
      where: { active: true },
      include: { _count: { select: { lines: true } } },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      skip: 5,
      take: 5,
    });
    expect(category.count).toHaveBeenCalledWith({ where: { active: true } });
    expect(page).toEqual({
      items: [
        { id: row.id, name: 'Llantas', active: true, inUse: false },
        { id: 'b', name: 'Llantas', active: true, inUse: true },
      ],
      total: 2,
      page: 2,
      pageSize: 5,
    });
  });

  it('creates a category', async () => {
    const { category, service } = setup();

    expect(await service.create({ name: 'Llantas' })).toEqual({
      id: row.id,
      name: 'Llantas',
      active: true,
      inUse: false,
    });
    expect(category.create).toHaveBeenCalledWith({
      data: { name: 'Llantas' },
      include: { _count: { select: { lines: true } } },
    });
  });

  it('refuses a name that is already taken, whatever its case', async () => {
    const { category, service } = setup();
    category.create.mockRejectedValue(prismaError('P2002'));
    category.update.mockRejectedValue(prismaError('P2002'));

    await expect(service.create({ name: 'llantas' })).rejects.toEqual(
      new ConflictException(EXPENSE_MESSAGES.categoryNameTaken),
    );
    await expect(service.update(row.id, { name: 'llantas' })).rejects.toEqual(
      new ConflictException(EXPENSE_MESSAGES.categoryNameTaken),
    );
  });

  it('renames, deactivates and reactivates', async () => {
    const { category, service } = setup();

    await service.update(row.id, { name: 'Neumáticos', active: false });

    expect(category.update).toHaveBeenCalledWith({
      where: { id: row.id },
      data: { name: 'Neumáticos', active: false },
      include: { _count: { select: { lines: true } } },
    });
  });

  it('answers 404 when the category to change does not exist', async () => {
    const { category, service } = setup();
    category.update.mockRejectedValue(prismaError('P2025'));

    await expect(service.update(row.id, { active: false })).rejects.toEqual(
      new NotFoundException(EXPENSE_MESSAGES.categoryNotFound),
    );
  });

  it('removes a category that has no expenses', async () => {
    const { category, service } = setup();

    await service.remove(row.id);

    expect(category.delete).toHaveBeenCalledWith({ where: { id: row.id } });
  });

  it('refuses to remove a category that has expenses, and tells to deactivate it', async () => {
    const { category, service } = setup();
    category.delete.mockRejectedValue(prismaError('P2003'));

    await expect(service.remove(row.id)).rejects.toEqual(
      new ConflictException(EXPENSE_MESSAGES.categoryInUse),
    );
  });

  it('answers 404 when the category to remove does not exist', async () => {
    const { category, service } = setup();
    category.delete.mockRejectedValue(prismaError('P2025'));

    await expect(service.remove(row.id)).rejects.toEqual(
      new NotFoundException(EXPENSE_MESSAGES.categoryNotFound),
    );
  });

  it('lets an unexpected database error through', async () => {
    const { category, service } = setup();
    category.delete.mockRejectedValue(new Error('down'));

    await expect(service.remove(row.id)).rejects.toThrow('down');
  });
});
