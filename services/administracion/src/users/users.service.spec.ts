import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { userListWhere } from './user-scope';
import { UsersService } from './users.service';

const admin = {
  userId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  role: 'SYSTEM_ADMIN' as const,
  branchId: null,
};
const branch = '9b2c7a10-1111-4c4c-8888-123456789abc';
const id = '11111111-2222-4333-8444-555555555555';

const setup = () => {
  const tx = {
    user: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ status: 'ACTIVE' }),
      count: jest.fn().mockResolvedValue(2),
      update: jest.fn().mockResolvedValue({}),
    },
    branch: { findUnique: jest.fn().mockResolvedValue({ id: branch, active: true }) },
    refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest
        .fn()
        .mockImplementation(({ data }) => ({ id, status: 'PENDING', branchId: null, ...data })),
      update: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    branch: { findUnique: jest.fn().mockResolvedValue({ id: branch, active: true }) },
    $transaction: jest.fn().mockImplementation((fn) => fn(tx)),
  };
  const links = { issue: jest.fn().mockResolvedValue(true) };
  return { tx, prisma, links, service: new UsersService(prisma as never, links as never) };
};

describe('create', () => {
  it('creates a pending account without password and sends the invitation', async () => {
    const { prisma, links, service } = setup();

    const user = await service.create(
      admin,
      { fullName: 'Luis', email: 'luis@correo.com', role: 'CASHIER', branchId: branch },
      'c',
    );

    expect(prisma.user.create.mock.calls[0][0].data).toEqual({
      email: 'luis@correo.com',
      fullName: 'Luis',
      role: 'CASHIER',
      branchId: branch,
      createdById: admin.userId,
    });
    expect(user).toMatchObject({ status: 'PENDING', role: 'CASHIER' });
    expect(links.issue).toHaveBeenCalledWith(expect.anything(), 'ACTIVATION', 'INVITATION', 'c');
  });

  it('keeps the client profile until activation', async () => {
    const { prisma, service } = setup();

    await service.create(admin, {
      fullName: 'Rosa',
      email: 'rosa@correo.com',
      role: 'CLIENT',
      dpi: '2345678901234',
      phone: '55554444',
      nit: '1234567',
    });

    expect(prisma.user.create.mock.calls[0][0].data.pendingProfile).toEqual({
      dpi: '2345678901234',
      phone: '55554444',
      nit: '1234567',
      address: null,
    });
  });

  it('forbids a branch admin from creating another branch admin', async () => {
    const { service } = setup();

    await expect(
      service.create(
        { userId: admin.userId, role: 'BRANCH_ADMIN', branchId: branch },
        { fullName: 'X', email: 'x@correo.com', role: 'BRANCH_ADMIN', branchId: branch },
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('refuses a taken email', async () => {
    const { prisma, service } = setup();
    prisma.user.findUnique.mockResolvedValueOnce({ id: 'other' });

    await expect(
      service.create(admin, { fullName: 'X', email: 'x@correo.com', role: 'SYSTEM_ADMIN' }),
    ).rejects.toThrow(new ConflictException('Ya existe una cuenta con ese correo.'));
  });
});

describe('deactivate', () => {
  it('never leaves the system without an active admin', async () => {
    const { tx, service } = setup();
    tx.user.findUnique.mockResolvedValue({ id, role: 'SYSTEM_ADMIN', status: 'ACTIVE' });
    tx.user.count.mockResolvedValue(1);

    await expect(service.deactivate(id)).rejects.toThrow(ConflictException);
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('deactivates and closes the sessions', async () => {
    const { tx, service } = setup();
    const now = new Date('2026-10-09T12:00:00.000Z');
    tx.user.findUnique.mockResolvedValue({ id, role: 'CASHIER', status: 'ACTIVE' });

    await service.deactivate(id, now);

    expect(tx.user.update).toHaveBeenCalledWith({ where: { id }, data: { status: 'INACTIVE' } });
    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: now },
    });
  });

  it('answers 404 for unknown users', async () => {
    const { service } = setup();
    await expect(service.deactivate(id)).rejects.toThrow(NotFoundException);
  });
});

describe('reactivate', () => {
  it('returns to active or pending depending on the password', async () => {
    const { prisma, service } = setup();
    prisma.user.findUnique.mockResolvedValueOnce({ id, status: 'INACTIVE', passwordHash: 'h' });
    await service.reactivate(id);
    prisma.user.findUnique.mockResolvedValueOnce({ id, status: 'INACTIVE', passwordHash: null });
    await service.reactivate(id);

    expect(prisma.user.update.mock.calls.map((call) => call[0].data.status)).toEqual([
      'ACTIVE',
      'PENDING',
    ]);
  });
});

describe('create failures', () => {
  const input = { fullName: 'X', email: 'x@correo.com', role: 'SYSTEM_ADMIN' as const };

  it('does not reserve the NIT: it stays in the pending profile', async () => {
    const { prisma, service } = setup();

    await service.create(admin, {
      fullName: 'Rosa',
      email: 'rosa@correo.com',
      role: 'CLIENT',
      dpi: '2345678901234',
      phone: '55554444',
      nit: '1234567',
    });

    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.user.create.mock.calls[0][0].data).not.toHaveProperty('nit');
  });

  it('turns a lost race on the email into a conflict', async () => {
    const { prisma, service } = setup();
    prisma.user.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'x' }),
    );

    await expect(service.create(admin, input)).rejects.toThrow(ConflictException);
  });

  it('does not hide unexpected database errors', async () => {
    const { prisma, links, service } = setup();
    prisma.user.create.mockRejectedValue(new Error('connection lost'));

    await expect(service.create(admin, input)).rejects.toThrow('connection lost');
    expect(links.issue).not.toHaveBeenCalled();
  });
});

describe('deactivate and reactivate edge cases', () => {
  it('does nothing for an account that is already inactive', async () => {
    const { tx, service } = setup();
    tx.user.findUnique.mockResolvedValue({ id, role: 'CASHIER', status: 'INACTIVE' });

    await service.deactivate(id);

    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('runs the check and the change as one transaction', async () => {
    const { prisma, tx, service } = setup();
    tx.user.findUnique.mockResolvedValue({ id, role: 'CASHIER', status: 'ACTIVE' });

    await service.deactivate(id);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function));
  });

  it('answers 404 for unknown users and ignores accounts that are not inactive', async () => {
    const { prisma, service } = setup();

    await expect(service.reactivate(id)).rejects.toThrow(NotFoundException);
    prisma.user.findUnique.mockResolvedValueOnce({ id, status: 'ACTIVE', passwordHash: 'h' });
    await service.reactivate(id);

    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

describe('deactivate under concurrency', () => {
  const activeAdmin = { id, role: 'SYSTEM_ADMIN', status: 'ACTIVE' };

  it('locks the active system admins before counting them', async () => {
    const { tx, service } = setup();
    tx.user.findUnique.mockResolvedValue(activeAdmin);

    await service.deactivate(id);

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    const [lockedAt] = tx.$queryRaw.mock.invocationCallOrder;
    const [countedAt] = tx.user.count.mock.invocationCallOrder;
    expect(lockedAt).toBeLessThan(countedAt!);
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id }, data: { status: 'INACTIVE' } });
  });

  it('reads the status again once it holds the lock', async () => {
    const { tx, service } = setup();
    tx.user.findUnique.mockResolvedValue(activeAdmin);
    tx.user.findUniqueOrThrow.mockResolvedValue({ status: 'INACTIVE' });
    tx.user.count.mockResolvedValue(1);

    await expect(service.deactivate(id)).resolves.toBeUndefined();

    expect(tx.user.findUniqueOrThrow).toHaveBeenCalledTimes(1);
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('does not lock anything for accounts that are not admins', async () => {
    const { tx, service } = setup();
    tx.user.findUnique.mockResolvedValue({ id, role: 'CASHIER', status: 'ACTIVE' });

    await service.deactivate(id);

    expect(tx.$queryRaw).not.toHaveBeenCalled();
    expect(tx.user.update).toHaveBeenCalled();
  });

  it('does not retry or hide database errors', async () => {
    const { prisma, service } = setup();
    prisma.$transaction.mockRejectedValue(new Error('connection lost'));

    await expect(service.deactivate(id)).rejects.toThrow('connection lost');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});

describe('create in a branch', () => {
  it.each([
    ['does not exist', null],
    ['is inactive', { id: branch, active: false }],
  ])('refuses a branch that %s', async (_, found) => {
    const { prisma, service } = setup();
    prisma.branch.findUnique.mockResolvedValue(found);

    await expect(
      service.create(admin, {
        fullName: 'Luis',
        email: 'luis@correo.com',
        role: 'CASHIER',
        branchId: branch,
      }),
    ).rejects.toThrow(new BadRequestException('Elige una sucursal activa.'));
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('invites a branch admin to an inactive branch, so it can get an admin back', async () => {
    const { prisma, service } = setup();
    prisma.branch.findUnique.mockResolvedValue({ id: branch, active: false });

    await service.create(admin, {
      fullName: 'Luis',
      email: 'luis@correo.com',
      role: 'BRANCH_ADMIN',
      branchId: branch,
    });

    expect(prisma.user.create).toHaveBeenCalled();
  });
});

describe('deactivate the admin of a branch', () => {
  const branchAdmin = { id, role: 'BRANCH_ADMIN', status: 'ACTIVE', branchId: branch };

  it('keeps the last admin of an active branch', async () => {
    const { tx, service } = setup();
    tx.user.findUnique.mockResolvedValue(branchAdmin);
    tx.user.count.mockResolvedValue(0);

    await expect(service.deactivate(id)).rejects.toThrow(
      new ConflictException('La sucursal debe conservar al menos un administrador.'),
    );
    expect(tx.user.count).toHaveBeenCalledWith({
      where: {
        role: 'BRANCH_ADMIN',
        branchId: branch,
        status: { not: 'INACTIVE' },
        id: { not: id },
      },
    });
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('deactivates when another admin, pending or active, remains', async () => {
    const { tx, service } = setup();
    tx.user.findUnique.mockResolvedValue(branchAdmin);
    tx.user.count.mockResolvedValue(1);

    await service.deactivate(id);

    expect(tx.user.update).toHaveBeenCalledWith({ where: { id }, data: { status: 'INACTIVE' } });
  });

  it('locks the admins of that branch before counting them', async () => {
    const { tx, service } = setup();
    tx.user.findUnique.mockResolvedValue(branchAdmin);
    tx.user.count.mockResolvedValue(1);

    await service.deactivate(id);

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    const [lockedAt] = tx.$queryRaw.mock.invocationCallOrder;
    const [countedAt] = tx.user.count.mock.invocationCallOrder;
    expect(lockedAt).toBeLessThan(countedAt!);
  });
});

describe('reactivate in a branch', () => {
  it.each([
    ['without a branch', { id, role: 'CASHIER', status: 'INACTIVE', branchId: null }, null],
    [
      'whose branch is inactive',
      { id, role: 'CASHIER', status: 'INACTIVE', branchId: branch },
      { id: branch, active: false },
    ],
  ])('refuses staff %s', async (_, user, found) => {
    const { prisma, service } = setup();
    prisma.user.findUnique.mockResolvedValueOnce(user);
    prisma.branch.findUnique.mockResolvedValue(found);

    await expect(service.reactivate(id)).rejects.toThrow(
      new ConflictException('Elige una sucursal activa.'),
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('reactivates a branch admin even when the branch is inactive, to get it out of the lock', async () => {
    const { prisma, service } = setup();
    prisma.user.findUnique.mockResolvedValueOnce({
      id,
      role: 'BRANCH_ADMIN',
      status: 'INACTIVE',
      branchId: branch,
      passwordHash: 'h',
    });
    prisma.branch.findUnique.mockResolvedValue({ id: branch, active: false });

    await service.reactivate(id);

    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id }, data: { status: 'ACTIVE' } });
  });

  it('still refuses a branch admin whose branch does not exist', async () => {
    const { prisma, service } = setup();
    prisma.user.findUnique.mockResolvedValueOnce({
      id,
      role: 'BRANCH_ADMIN',
      status: 'INACTIVE',
      branchId: branch,
    });
    prisma.branch.findUnique.mockResolvedValue(null);

    await expect(service.reactivate(id)).rejects.toThrow(
      new ConflictException('Elige una sucursal activa.'),
    );
  });

  it('reactivates staff of an active branch', async () => {
    const { prisma, service } = setup();
    prisma.user.findUnique.mockResolvedValueOnce({
      id,
      role: 'CASHIER',
      status: 'INACTIVE',
      branchId: branch,
      passwordHash: 'h',
    });

    await service.reactivate(id);

    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id }, data: { status: 'ACTIVE' } });
  });
});

describe('list and get', () => {
  const row = {
    id,
    email: 'a@correo.com',
    fullName: 'Ana',
    role: 'CASHIER',
    branchId: branch,
    status: 'ACTIVE',
  };

  it('lists the users the actor may see, ordered by name', async () => {
    const { prisma, service } = setup();
    prisma.user.findMany.mockResolvedValue([row]);
    const query = { role: 'CASHIER' as const, q: 'ana' };

    const users = await service.list(admin, query);

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: userListWhere(admin, query),
      orderBy: { fullName: 'asc' },
    });
    expect(users).toEqual([row]);
  });

  it('gets one user inside the actor scope', async () => {
    const { prisma, service } = setup();
    prisma.user.findFirst.mockResolvedValue(row);

    expect(await service.get(admin, id)).toEqual(row);
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { AND: [userListWhere(admin, {}), { id }] },
    });
  });

  it('answers not found when the user is out of scope', async () => {
    const { service } = setup();

    await expect(service.get(admin, id)).rejects.toThrow(NotFoundException);
  });
});

describe('update', () => {
  const cashier = { id, role: 'CASHIER', status: 'ACTIVE', branchId: branch };
  const newBranch = '5d1f3a20-2222-4d4d-9999-123456789abc';

  it('changes the name', async () => {
    const { tx, service } = setup();
    tx.user.findUnique.mockResolvedValue(cashier);
    tx.user.update.mockResolvedValue({ ...cashier, fullName: 'Ana Sic', email: 'a@correo.com' });

    const user = await service.update(id, { fullName: 'Ana Sic' });

    expect(tx.user.update).toHaveBeenCalledWith({ where: { id }, data: { fullName: 'Ana Sic' } });
    expect(user.fullName).toBe('Ana Sic');
  });

  it('moves staff to an active branch', async () => {
    const { tx, service } = setup();
    tx.user.findUnique.mockResolvedValue(cashier);
    tx.branch.findUnique.mockResolvedValue({ id: newBranch, active: true });
    tx.user.update.mockResolvedValue({ ...cashier, branchId: newBranch });

    await service.update(id, { branchId: newBranch });

    expect(tx.user.update).toHaveBeenCalledWith({ where: { id }, data: { branchId: newBranch } });
  });

  it('answers not found for unknown users', async () => {
    const { service } = setup();

    await expect(service.update(id, { fullName: 'Ana Sic' })).rejects.toThrow(NotFoundException);
  });

  it('refuses a branch for roles that do not belong to one', async () => {
    const { tx, service } = setup();
    tx.user.findUnique.mockResolvedValue({
      id,
      role: 'SYSTEM_ADMIN',
      status: 'ACTIVE',
      branchId: null,
    });

    await expect(service.update(id, { branchId: newBranch })).rejects.toThrow(
      new BadRequestException('Este rol no pertenece a una sucursal.'),
    );
  });

  it('refuses an inactive target branch', async () => {
    const { tx, service } = setup();
    tx.user.findUnique.mockResolvedValue(cashier);
    tx.branch.findUnique.mockResolvedValue({ id: newBranch, active: false });

    await expect(service.update(id, { branchId: newBranch })).rejects.toThrow(
      new BadRequestException('Elige una sucursal activa.'),
    );
  });

  it('moves a branch admin into an inactive branch, where one is needed before reactivating', async () => {
    const { tx, service } = setup();
    tx.user.findUnique.mockResolvedValue({ ...cashier, role: 'BRANCH_ADMIN' });
    tx.user.findUniqueOrThrow.mockResolvedValue({ status: 'ACTIVE', branchId: branch });
    tx.user.count.mockResolvedValue(1);
    tx.branch.findUnique.mockResolvedValue({ id: newBranch, active: false });
    tx.user.update.mockResolvedValue({ ...cashier, role: 'BRANCH_ADMIN', branchId: newBranch });

    await service.update(id, { branchId: newBranch });

    expect(tx.user.update).toHaveBeenCalled();
  });

  it('does not move the last admin of an active branch', async () => {
    const { tx, service } = setup();
    tx.user.findUnique.mockResolvedValue({ ...cashier, role: 'BRANCH_ADMIN' });
    tx.user.findUniqueOrThrow.mockResolvedValue({ status: 'ACTIVE', branchId: branch });
    tx.user.count.mockResolvedValue(0);

    await expect(service.update(id, { branchId: newBranch })).rejects.toThrow(
      new ConflictException('La sucursal debe conservar al menos un administrador.'),
    );
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('moves an admin when another one remains', async () => {
    const { tx, service } = setup();
    tx.user.findUnique.mockResolvedValue({ ...cashier, role: 'BRANCH_ADMIN' });
    tx.user.findUniqueOrThrow.mockResolvedValue({ status: 'ACTIVE', branchId: branch });
    tx.user.count.mockResolvedValue(1);
    tx.user.update.mockResolvedValue({ ...cashier, role: 'BRANCH_ADMIN', branchId: newBranch });

    await service.update(id, { branchId: newBranch });

    expect(tx.user.update).toHaveBeenCalled();
  });
});

describe('resendInvitation', () => {
  const pending = { id, email: 'a@correo.com', fullName: 'Ana', status: 'PENDING' };

  it('sends a new invitation to a pending account', async () => {
    const { prisma, links, service } = setup();
    prisma.user.findFirst.mockResolvedValue(pending);

    expect(await service.resendInvitation(admin, id, 'c')).toEqual({
      message: 'Enviamos de nuevo la invitación.',
    });
    expect(links.issue).toHaveBeenCalledWith(pending, 'ACTIVATION', 'INVITATION', 'c');
  });

  it.each([
    ['ACTIVE', 'Esta cuenta ya creó su contraseña.'],
    ['INACTIVE', 'Esta cuenta está desactivada. Reactívala primero.'],
  ])('refuses an %s account', async (status, message) => {
    const { prisma, links, service } = setup();
    prisma.user.findFirst.mockResolvedValue({ ...pending, status });

    await expect(service.resendInvitation(admin, id)).rejects.toThrow(
      new ConflictException(message),
    );
    expect(links.issue).not.toHaveBeenCalled();
  });

  it('answers 429 when the hourly limit is reached', async () => {
    const { prisma, links, service } = setup();
    prisma.user.findFirst.mockResolvedValue(pending);
    links.issue.mockResolvedValue(false);

    const failure = await service.resendInvitation(admin, id).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(HttpException);
    expect((failure as HttpException).getStatus()).toBe(429);
    expect((failure as HttpException).message).toBe(
      'Ya enviamos varios correos a esta cuenta. Intenta de nuevo en una hora.',
    );
  });

  it('answers not found outside the actor scope', async () => {
    const { service } = setup();

    await expect(service.resendInvitation(admin, id)).rejects.toThrow(NotFoundException);
  });
});
