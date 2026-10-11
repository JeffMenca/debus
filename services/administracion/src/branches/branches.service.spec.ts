import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { WITH_ADMINS } from './branch-mappers';
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
    user: { create: jest.fn().mockResolvedValue(adminRow) },
  };
  const prisma = {
    branch: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([{ ...branchRow, users: [] }]),
      findUnique: jest.fn().mockResolvedValue({ ...branchRow, users: [] }),
    },
    user: { findUnique: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn((fn) => fn(tx)),
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

  it('lets unexpected errors through', async () => {
    const { prisma, service } = setup();
    prisma.$transaction.mockRejectedValue(new Error('database down'));

    await expect(service.create(admin, input)).rejects.toThrow('database down');
  });
});

describe('BranchesService.list', () => {
  it('shows only active branches, ordered by name, with their admins', async () => {
    const { prisma, service } = setup();

    const branches = await service.list(admin, false);

    expect(prisma.branch.findMany).toHaveBeenCalledWith({
      where: { active: true },
      include: WITH_ADMINS,
      orderBy: { name: 'asc' },
    });
    expect(branches).toHaveLength(1);
  });

  it('shows inactive ones only to a system admin who asks for them', async () => {
    const { prisma, service } = setup();
    const cashier = { userId: admin.userId, role: 'CASHIER' as const, branchId: branchRow.id };

    await service.list(admin, true);
    await service.list(cashier, true);

    expect(prisma.branch.findMany.mock.calls[0][0].where).toEqual({});
    expect(prisma.branch.findMany.mock.calls[1][0].where).toEqual({ active: true });
  });
});

describe('BranchesService.get', () => {
  it('returns the branch to a system admin', async () => {
    const { service } = setup();

    expect(await service.get(admin, branchRow.id)).toMatchObject({ id: branchRow.id, admins: [] });
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
    prisma.branch.findUnique.mockResolvedValue(null);

    await expect(service.get(admin, branchRow.id)).rejects.toThrow(
      new NotFoundException('No encontramos esa sucursal.'),
    );
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
