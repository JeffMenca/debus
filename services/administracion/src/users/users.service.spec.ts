import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
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
      count: jest.fn().mockResolvedValue(2),
      update: jest.fn().mockResolvedValue({}),
    },
    refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
  };
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest
        .fn()
        .mockImplementation(({ data }) => ({ id, status: 'PENDING', branchId: null, ...data })),
      update: jest.fn().mockResolvedValue({}),
    },
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

  it('runs the check and the change as one serializable transaction', async () => {
    const { prisma, tx, service } = setup();
    tx.user.findUnique.mockResolvedValue({ id, role: 'CASHIER', status: 'ACTIVE' });

    await service.deactivate(id);

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
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
  const conflict = () =>
    new Prisma.PrismaClientKnownRequestError('write conflict', {
      code: 'P2034',
      clientVersion: 'x',
    });

  it('runs the check again when the database aborts a serializable transaction', async () => {
    const { prisma, tx, service } = setup();
    tx.user.findUnique.mockResolvedValue({ id, role: 'SYSTEM_ADMIN', status: 'ACTIVE' });
    tx.user.count.mockResolvedValue(1);
    prisma.$transaction.mockRejectedValueOnce(conflict());

    await expect(service.deactivate(id)).rejects.toThrow(
      new ConflictException('Debe quedar al menos un administrador del sistema activo.'),
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('succeeds when the second try finds no conflict', async () => {
    const { prisma, tx, service } = setup();
    tx.user.findUnique.mockResolvedValue({ id, role: 'CASHIER', status: 'ACTIVE' });
    prisma.$transaction.mockRejectedValueOnce(conflict());

    await expect(service.deactivate(id)).resolves.toBeUndefined();
  });

  it('asks to try again, with a friendly 409, when the conflict persists', async () => {
    const { prisma, service } = setup();
    prisma.$transaction.mockRejectedValue(conflict());

    await expect(service.deactivate(id)).rejects.toThrow(
      new ConflictException(
        'Otra persona está haciendo un cambio al mismo tiempo. Intenta de nuevo.',
      ),
    );
  });

  it('does not hide other database errors', async () => {
    const { prisma, service } = setup();
    prisma.$transaction.mockRejectedValue(new Error('connection lost'));

    await expect(service.deactivate(id)).rejects.toThrow('connection lost');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
