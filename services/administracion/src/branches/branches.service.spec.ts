import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { WITH_ADMINS } from './branch-mappers';
import { branchCountWhere, branchListWhere } from './branch-scope';
import { BranchesService } from './branches.service';

const admin = {
  userId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  role: 'SYSTEM_ADMIN' as const,
  branchId: null,
};
const fields = {
  code: 'XEL',
  name: 'Quetzaltenango',
  department: 'Quetzaltenango' as const,
  municipality: 'Quetzaltenango',
  address: '4a calle 12-30 zona 1',
  phone: '77612233',
  latitude: 14.8347,
  longitude: -91.5181,
};
const branchRow = {
  id: '9b2c7a10-1111-4c4c-8888-123456789abc',
  ...fields,
  latitude: new Prisma.Decimal('14.834700'),
  longitude: new Prisma.Decimal('-91.518100'),
  active: true,
  version: 1,
  createdById: admin.userId,
  createdAt: new Date(),
  updatedAt: new Date(),
};
const adminRow = {
  id: '11111111-2222-4333-8444-555555555555',
  email: 'luis@correo.com',
  fullName: 'Luis Ramírez',
  status: 'PENDING',
};
const input = { ...fields, admin: { fullName: 'Luis Ramírez', email: 'luis@correo.com' } };

const setup = () => {
  const tx = {
    branch: {
      create: jest.fn().mockResolvedValue(branchRow),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ ...branchRow, users: [adminRow] }),
      findUnique: jest.fn().mockResolvedValue(branchRow),
      update: jest.fn().mockResolvedValue({ ...branchRow, version: 2, users: [] }),
    },
    user: { create: jest.fn().mockResolvedValue(adminRow), count: jest.fn().mockResolvedValue(1) },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
  const prisma = {
    branch: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([{ ...branchRow, users: [] }]),
      findUnique: jest.fn().mockResolvedValue({ ...branchRow, users: [] }),
      count: jest.fn().mockResolvedValue(1),
      groupBy: jest.fn().mockResolvedValue([{ active: true, _count: { _all: 1 } }]),
    },
    user: { findUnique: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn((work) => (Array.isArray(work) ? Promise.all(work) : work(tx))),
  };
  const links = { writeLink: jest.fn().mockResolvedValue(undefined) };
  const events = {
    branchChanged: jest.fn().mockResolvedValue(undefined),
    flush: jest.fn().mockResolvedValue(undefined),
  };
  return {
    tx,
    prisma,
    links,
    events,
    service: new BranchesService(prisma as never, links as never, events as never),
  };
};

describe('BranchesService.create', () => {
  it('creates the branch and its first admin in one transaction', async () => {
    const { tx, prisma, links, events, service } = setup();

    const branch = await service.create(admin, input, 'c');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.branch.create).toHaveBeenCalledWith({
      data: { ...fields, createdById: admin.userId },
    });
    expect(tx.user.create).toHaveBeenCalledWith({
      data: {
        email: 'luis@correo.com',
        fullName: 'Luis Ramírez',
        role: 'BRANCH_ADMIN',
        branchId: branchRow.id,
        createdById: admin.userId,
      },
    });
    expect(links.writeLink).toHaveBeenCalledWith(tx, adminRow, 'ACTIVATION', 'INVITATION', 'c');
    expect(events.branchChanged).toHaveBeenCalledWith(
      tx,
      'BranchCreated',
      expect.objectContaining({ branchId: branchRow.id, version: 1 }),
      'c',
    );
    expect(events.flush).toHaveBeenCalledTimes(1);
    expect(branch.admins).toEqual([expect.objectContaining({ email: 'luis@correo.com' })]);
  });

  it.each([
    ['code', 'Ya existe una sucursal con ese código.'],
    ['name', 'Ya existe una sucursal con ese nombre.'],
  ])('refuses a taken %s without opening a transaction', async (taken, message) => {
    const { prisma, service } = setup();
    prisma.branch.findFirst.mockImplementation(({ where }) =>
      Promise.resolve(taken in where ? branchRow : null),
    );

    await expect(service.create(admin, input)).rejects.toThrow(new ConflictException(message));
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses a taken admin email without opening a transaction', async () => {
    const { prisma, service } = setup();
    prisma.user.findUnique.mockResolvedValue(adminRow);

    await expect(service.create(admin, input)).rejects.toThrow(
      new ConflictException('Ya existe una cuenta con ese correo.'),
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('turns a unique violation inside the transaction into a conflict and publishes nothing', async () => {
    const { prisma, events, service } = setup();
    prisma.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    await expect(service.create(admin, input)).rejects.toThrow(
      new ConflictException('Ya existe una sucursal con esos datos.'),
    );
    expect(events.flush).not.toHaveBeenCalled();
  });

  it('tells a lost race on the admin email apart from a lost race on the branch', async () => {
    const { tx, service } = setup();
    tx.user.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    await expect(service.create(admin, input)).rejects.toThrow(
      new ConflictException('Ya existe una cuenta con ese correo.'),
    );
  });

  it('lets unexpected errors through', async () => {
    const { prisma, service } = setup();
    prisma.$transaction.mockRejectedValue(new Error('database down'));

    await expect(service.create(admin, input)).rejects.toThrow('database down');
  });
});

describe('BranchesService.list', () => {
  const cashier = { userId: admin.userId, role: 'CASHIER' as const, branchId: branchRow.id };
  const query = { status: 'active' as const, page: 2, pageSize: 10 };

  it('pages a system admin the branches in a stable order, with their admins and the counts', async () => {
    const { prisma, service } = setup();
    prisma.branch.count.mockResolvedValue(11);
    prisma.branch.groupBy.mockResolvedValue([
      { active: true, _count: { _all: 11 } },
      { active: false, _count: { _all: 2 } },
    ]);

    const page = await service.list(admin, query);

    expect(prisma.branch.findMany).toHaveBeenCalledWith({
      where: branchListWhere(admin, query),
      include: WITH_ADMINS,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      skip: 10,
      take: 10,
    });
    expect(prisma.branch.count).toHaveBeenCalledWith({ where: branchListWhere(admin, query) });
    expect(prisma.branch.groupBy).toHaveBeenCalledWith({
      by: ['active'],
      where: branchCountWhere(admin, query),
      orderBy: { active: 'asc' },
      _count: { _all: true },
    });
    expect(page).toMatchObject({
      total: 11,
      page: 2,
      pageSize: 10,
      summary: { statusCounts: { active: 11, inactive: 2 } },
    });
    expect(page.items).toEqual([expect.objectContaining({ id: branchRow.id, admins: [] })]);
  });

  it('never loads nor returns the admins for any other role', async () => {
    const { prisma, service } = setup();
    prisma.branch.findMany.mockResolvedValue([{ ...branchRow, users: [adminRow] }]);

    for (const actor of [cashier, { ...cashier, role: 'CLIENT' as const, branchId: null }]) {
      const page = await service.list(actor, query);
      expect(page.items[0]).toMatchObject({ id: branchRow.id });
      expect(page.items[0]).not.toHaveProperty('admins');
    }
    for (const [args] of prisma.branch.findMany.mock.calls) {
      expect(args).toEqual({
        where: { active: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: 10,
        take: 10,
      });
    }
  });

  it('shows inactive ones only to a system admin who asks for them', async () => {
    const { prisma, service } = setup();
    const all = { ...query, status: 'all' as const };

    await service.list(admin, all);
    await service.list(cashier, all);

    expect(prisma.branch.findMany.mock.calls[0][0].where).toEqual({});
    expect(prisma.branch.findMany.mock.calls[1][0].where).toEqual({ active: true });
  });
});

describe('BranchesService.locations', () => {
  it('pages the active branches by name and id, with only what the map needs', async () => {
    const { prisma, service } = setup();
    prisma.branch.count.mockResolvedValue(21);

    const page = await service.locations({ page: 2, pageSize: 20 });

    expect(prisma.branch.findMany).toHaveBeenCalledWith({
      where: { active: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      skip: 20,
      take: 20,
    });
    expect(prisma.branch.count).toHaveBeenCalledWith({ where: { active: true } });
    expect(page).toEqual({
      items: [
        {
          id: branchRow.id,
          name: 'Quetzaltenango',
          municipality: 'Quetzaltenango',
          department: 'Quetzaltenango',
          latitude: 14.8347,
          longitude: -91.5181,
        },
      ],
      total: 21,
      page: 2,
      pageSize: 20,
    });
  });

  it('does not read the administrators', async () => {
    const { prisma, service } = setup();

    await service.locations({ page: 1, pageSize: 100 });

    expect(prisma.branch.findMany.mock.calls[0][0]).not.toHaveProperty('include');
  });
});

describe('BranchesService.get', () => {
  it('returns the branch to a system admin', async () => {
    const { service } = setup();

    expect(await service.get(admin, branchRow.id)).toMatchObject({ id: branchRow.id, admins: [] });
  });

  it('returns staff of the branch the branch without its admins', async () => {
    const { prisma, service } = setup();
    const staff = { userId: admin.userId, role: 'CASHIER' as const, branchId: branchRow.id };

    const branch = await service.get(staff, branchRow.id);

    expect(branch).toMatchObject({ id: branchRow.id });
    expect(branch).not.toHaveProperty('admins');
    expect(prisma.branch.findUnique).toHaveBeenCalledWith({ where: { id: branchRow.id } });
  });

  it('forbids staff of another branch and clients', async () => {
    const { service } = setup();
    const other = { userId: admin.userId, role: 'CASHIER' as const, branchId: adminRow.id };

    await expect(service.get(other, branchRow.id)).rejects.toThrow(
      new ForbiddenException('No tienes permiso para hacer esto.'),
    );
  });

  it('answers not found for an unknown branch', async () => {
    const { prisma, service } = setup();
    const staff = { userId: admin.userId, role: 'CASHIER' as const, branchId: branchRow.id };
    prisma.branch.findUnique.mockResolvedValue(null);

    for (const actor of [admin, staff]) {
      await expect(service.get(actor, branchRow.id)).rejects.toThrow(
        new NotFoundException('No encontramos esa sucursal.'),
      );
    }
  });
});

describe('BranchesService.update', () => {
  it('raises the version, announces the change inside the transaction and flushes after it', async () => {
    const { tx, prisma, events, service } = setup();

    const branch = await service.update(branchRow.id, { phone: '77610000' }, 'c');

    expect(tx.branch.update).toHaveBeenCalledWith({
      where: { id: branchRow.id },
      data: { phone: '77610000', version: { increment: 1 } },
      include: WITH_ADMINS,
    });
    expect(events.branchChanged).toHaveBeenCalledWith(
      tx,
      'BranchUpdated',
      expect.objectContaining({ branchId: branchRow.id, version: 2 }),
      'c',
    );
    expect(events.flush).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(branch.version).toBe(2);
  });

  it('refuses a code or name that belongs to another branch, but allows its own', async () => {
    const { prisma, service } = setup();
    prisma.branch.findFirst.mockImplementation(({ where }) =>
      Promise.resolve(where.id?.not === branchRow.id ? null : branchRow),
    );

    await expect(service.update(branchRow.id, { code: 'ABC' })).resolves.toBeDefined();

    prisma.branch.findFirst.mockResolvedValue(branchRow);
    await expect(service.update(branchRow.id, { code: 'ABC' })).rejects.toThrow(
      new ConflictException('Ya existe una sucursal con ese código.'),
    );
    await expect(service.update(branchRow.id, { name: 'Otra' })).rejects.toThrow(
      new ConflictException('Ya existe una sucursal con ese nombre.'),
    );
  });

  it('answers not found for an unknown branch and publishes nothing', async () => {
    const { tx, events, service } = setup();
    tx.branch.findUnique.mockResolvedValue(null);

    await expect(service.update(branchRow.id, { phone: '77610000' })).rejects.toThrow(
      new NotFoundException('No encontramos esa sucursal.'),
    );
    expect(events.flush).not.toHaveBeenCalled();
  });

  it('turns a unique violation into a conflict and lets other errors through', async () => {
    const { prisma, events, service } = setup();
    prisma.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    prisma.$transaction.mockRejectedValueOnce(new Error('database down'));

    await expect(service.update(branchRow.id, { phone: '77610000' })).rejects.toThrow(
      new ConflictException('Ya existe una sucursal con esos datos.'),
    );
    await expect(service.update(branchRow.id, { phone: '77610000' })).rejects.toThrow(
      'database down',
    );
    expect(events.flush).not.toHaveBeenCalled();
  });
});

describe('BranchesService.setActive', () => {
  it('deactivates, raises the version and announces it', async () => {
    const { tx, events, service } = setup();

    await service.setActive(branchRow.id, false, 'c');

    expect(tx.branch.update).toHaveBeenCalledWith({
      where: { id: branchRow.id },
      data: { active: false, version: { increment: 1 } },
    });
    expect(events.branchChanged).toHaveBeenCalledWith(
      tx,
      'BranchUpdated',
      expect.objectContaining({ branchId: branchRow.id }),
      'c',
    );
    expect(events.flush).toHaveBeenCalledTimes(1);
  });

  it('reactivates only after locking and finding a pending or active admin', async () => {
    const { tx, events, service } = setup();
    tx.branch.findUnique.mockResolvedValue({ ...branchRow, active: false });

    await service.setActive(branchRow.id, true, 'c');

    expect(tx.user.count).toHaveBeenCalledWith({
      where: { role: 'BRANCH_ADMIN', branchId: branchRow.id, status: { not: 'INACTIVE' } },
    });
    const [lockedAt] = tx.$queryRaw.mock.invocationCallOrder;
    expect(lockedAt).toBeLessThan(tx.user.count.mock.invocationCallOrder[0]!);
    expect(tx.branch.update).toHaveBeenCalledWith({
      where: { id: branchRow.id },
      data: { active: true, version: { increment: 1 } },
    });
    expect(events.flush).toHaveBeenCalledTimes(1);
  });

  it('refuses to reactivate a branch without a pending or active admin and announces nothing', async () => {
    const { tx, events, service } = setup();
    tx.branch.findUnique.mockResolvedValue({ ...branchRow, active: false });
    tx.user.count.mockResolvedValue(0);

    await expect(service.setActive(branchRow.id, true)).rejects.toThrow(
      new ConflictException(
        'Para reactivar la sucursal, primero reactiva o invita a su administrador.',
      ),
    );
    expect(tx.branch.update).not.toHaveBeenCalled();
    expect(events.flush).not.toHaveBeenCalled();
  });

  it('does not count admins to deactivate a branch', async () => {
    const { tx, service } = setup();

    await service.setActive(branchRow.id, false);

    expect(tx.user.count).not.toHaveBeenCalled();
  });

  it('does nothing when the branch already has that state', async () => {
    const { tx, events, service } = setup();

    await service.setActive(branchRow.id, true);

    expect(tx.branch.update).not.toHaveBeenCalled();
    expect(events.branchChanged).not.toHaveBeenCalled();
    expect(events.flush).not.toHaveBeenCalled();
  });

  it('answers not found for an unknown branch', async () => {
    const { tx, service } = setup();
    tx.branch.findUnique.mockResolvedValue(null);

    await expect(service.setActive(branchRow.id, false)).rejects.toThrow(
      new NotFoundException('No encontramos esa sucursal.'),
    );
  });
});
