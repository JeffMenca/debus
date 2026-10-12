import { createEnvelope, exampleDriver } from '@debus/contracts';
import { Logger } from '@nestjs/common';
import { DriverAccountsHandler } from './driver-accounts.handler';

const envelope = createEnvelope('DriverAdded', exampleDriver, 'corr');

const setup = (over: { user?: unknown; emailOwner?: unknown } = {}) => {
  const created = {
    id: exampleDriver.driverId,
    email: exampleDriver.email,
    fullName: 'Julio Pérez',
  };
  const db = {
    user: {
      findUnique: jest
        .fn()
        .mockImplementation(({ where }: { where: { id?: string; email?: string } }) =>
          Promise.resolve(where.id ? (over.user ?? null) : (over.emailOwner ?? null)),
        ),
      create: jest.fn().mockResolvedValue(created),
      update: jest.fn().mockResolvedValue({}),
    },
    refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
  const prisma = { ...db };
  const links = { writeLink: jest.fn().mockResolvedValue(undefined) };
  return {
    db,
    prisma,
    links,
    created,
    handler: new DriverAccountsHandler(prisma as never, links as never),
  };
};
const account = (over = {}) => ({
  id: exampleDriver.driverId,
  email: exampleDriver.email,
  role: 'DRIVER',
  driverVersion: 1,
  passwordHash: null,
  ...over,
});

describe('DriverAccountsHandler', () => {
  it.each(['added', 'updated'] as const)(
    'opens the account of a new driver on %s',
    async (method) => {
      const { db, links, created, handler } = setup();

      await handler[method](exampleDriver, envelope, db as never);

      expect(db.user.create).toHaveBeenCalledWith({
        data: {
          id: exampleDriver.driverId,
          email: exampleDriver.email,
          fullName: exampleDriver.fullName,
          role: 'DRIVER',
          branchId: exampleDriver.branchId,
          driverVersion: 1,
          status: 'PENDING',
        },
      });
      expect(links.writeLink).toHaveBeenCalledWith(db, created, 'ACTIVATION', 'INVITATION', 'corr');
    },
  );

  it('opens an inactive account without an invitation for a driver registered as inactive', async () => {
    const { db, links, handler } = setup();

    await handler.added({ ...exampleDriver, active: false }, envelope, db as never);

    expect(db.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: 'INACTIVE' }),
    });
    expect(links.writeLink).not.toHaveBeenCalled();
  });

  it('does not open an account on an email that belongs to another one', async () => {
    const { db, links, handler } = setup({ emailOwner: { id: 'someone-else' } });

    await handler.added(exampleDriver, envelope, db as never);

    expect(db.user.create).not.toHaveBeenCalled();
    expect(links.writeLink).not.toHaveBeenCalled();
  });

  it('keeps the data of the account in step with a newer snapshot', async () => {
    const { db, handler } = setup({ user: account({ passwordHash: 'h' }) });
    const snapshot = { ...exampleDriver, fullName: 'Julio P.', version: 2 };

    await handler.updated(snapshot, envelope, db as never);

    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: exampleDriver.driverId },
      data: {
        fullName: 'Julio P.',
        branchId: exampleDriver.branchId,
        status: 'ACTIVE',
        driverVersion: 2,
      },
    });
    expect(db.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it('puts a driver that never set a password back to pending', async () => {
    const { db, handler } = setup({ user: account() });

    await handler.updated({ ...exampleDriver, version: 2 }, envelope, db as never);

    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: exampleDriver.driverId },
      data: expect.objectContaining({ status: 'PENDING' }),
    });
  });

  it('deactivates the account and ends its sessions when the driver is deactivated', async () => {
    const { db, handler } = setup({ user: account({ passwordHash: 'h' }) });

    await handler.updated({ ...exampleDriver, active: false, version: 2 }, envelope, db as never);

    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: exampleDriver.driverId },
      data: expect.objectContaining({ status: 'INACTIVE' }),
    });
    expect(db.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: exampleDriver.driverId, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('moves the account to the new email of the driver when nobody uses it', async () => {
    const { db, handler } = setup({ user: account({ email: 'viejo@correo.com' }) });

    await handler.updated({ ...exampleDriver, version: 2 }, envelope, db as never);

    expect(db.user.findUnique).toHaveBeenCalledWith({ where: { email: exampleDriver.email } });
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: exampleDriver.driverId },
      data: expect.objectContaining({ email: exampleDriver.email }),
    });
  });

  it('keeps the rest of the data when the new email is taken by another account', async () => {
    const { db, handler } = setup({
      user: account({ email: 'viejo@correo.com' }),
      emailOwner: { id: 'someone-else' },
    });
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    await handler.updated({ ...exampleDriver, version: 2 }, envelope, db as never);

    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: exampleDriver.driverId },
      data: {
        fullName: exampleDriver.fullName,
        branchId: exampleDriver.branchId,
        status: 'PENDING',
        driverVersion: 2,
      },
    });
    expect(warn).toHaveBeenCalledWith(
      { driverId: exampleDriver.driverId },
      expect.stringContaining('keeps its email'),
    );
    warn.mockRestore();
  });

  it('ignores an old snapshot and an account that is not a driver', async () => {
    const old = setup({ user: account({ driverVersion: 5 }) });
    await old.handler.updated({ ...exampleDriver, version: 2 }, envelope, old.db as never);
    expect(old.db.user.update).not.toHaveBeenCalled();

    const other = setup({ user: account({ role: 'CLIENT' }) });
    await other.handler.updated({ ...exampleDriver, version: 2 }, envelope, other.db as never);
    expect(other.db.user.update).not.toHaveBeenCalled();
  });

  it('rejects a malformed payload without writing', async () => {
    const { db, handler } = setup();

    await expect(handler.added({ driverId: 'x' }, envelope, db as never)).rejects.toThrow();
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it('falls back to the service client outside the inbox transaction', async () => {
    const { prisma, handler } = setup();

    await handler.added(exampleDriver, envelope);

    expect(prisma.user.create).toHaveBeenCalledTimes(1);
  });
});
