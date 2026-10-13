import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { DriversService } from './drivers.service';

const branchId = '9b2c7a10-1111-4c4c-8888-123456789abc';
const driverId = '2a1b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const busId = '1f0e2d3c-4b5a-4968-8776-655443322110';
const fields = {
  fullName: 'Julio Pérez',
  email: 'julio.perez@example.com',
  phone: '55551234',
  licenseNumber: 'A1234567',
  licenseType: 'A' as const,
  licenseExpiresOn: '2027-03-01',
  baseSalary: 350,
};
const driverRow = {
  id: driverId,
  branchId,
  ...fields,
  licenseExpiresOn: new Date('2027-03-01T00:00:00.000Z'),
  baseSalary: new Prisma.Decimal('350.00'),
  active: true,
  completedTrips: 0,
  photoKey: null,
  searchText: '',
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
  assignedBus: null,
};
const busRow = { id: busId, branchId, plate: 'C482BTX', version: 1, active: true };

const setup = (over: { photoKey?: string | null; active?: boolean } = {}) => {
  const tx = {
    branchCopy: { findUnique: jest.fn().mockResolvedValue({ id: branchId, active: true }) },
    driver: {
      findFirst: jest.fn().mockResolvedValue({ ...driverRow, ...over }),
      create: jest.fn().mockResolvedValue(driverRow),
      update: jest.fn().mockResolvedValue({ ...driverRow, version: 2 }),
    },
    bus: {
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({ ...busRow, assignedDriverId: null, version: 2 }),
    },
    tripCopy: { findMany: jest.fn().mockResolvedValue([]) },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
  const prisma = {
    driver: {
      findMany: jest.fn().mockResolvedValue([driverRow]),
      count: jest.fn().mockResolvedValue(1),
      groupBy: jest.fn().mockResolvedValue([{ active: true, _count: { _all: 1 } }]),
      findFirst: jest.fn().mockResolvedValue({ ...driverRow, ...over }),
      update: jest.fn().mockResolvedValue(driverRow),
    },
    $transaction: jest.fn((work) => (Array.isArray(work) ? Promise.all(work) : work(tx))),
  };
  const events = {
    driver: jest.fn().mockResolvedValue(undefined),
    bus: jest.fn().mockResolvedValue(undefined),
    flush: jest.fn().mockResolvedValue(undefined),
  };
  const photos = {
    save: jest.fn().mockResolvedValue(undefined),
    read: jest.fn().mockResolvedValue({ data: Buffer.from('x'), contentType: 'image/png' }),
    remove: jest.fn().mockResolvedValue(undefined),
  };
  return {
    tx,
    prisma,
    events,
    photos,
    service: new DriversService(prisma as never, events as never, photos as never),
  };
};

describe('DriversService.list', () => {
  it('pages the drivers of the branch, ordered by name, and counts active and inactive', async () => {
    const { prisma, service } = setup();

    const page = await service.list(branchId, { status: 'active', page: 1, pageSize: 20 });

    expect(prisma.driver.findMany).toHaveBeenCalledWith({
      where: { branchId, active: true },
      include: { assignedBus: { select: { plate: true } } },
      orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
      skip: 0,
      take: 20,
    });
    expect(prisma.driver.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ by: ['active'], where: { branchId } }),
    );
    expect(page.summary.statusCounts).toEqual({ active: 1, inactive: 0 });
    expect(page).toMatchObject({ total: 1, page: 1, pageSize: 20 });
  });

  it('counts the whole branch while the licence window narrows the list', async () => {
    const { prisma, service } = setup();

    await service.list(branchId, {
      status: 'active',
      expiringWithinDays: 30,
      page: 1,
      pageSize: 5,
    });

    expect(prisma.driver.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { branchId, active: true, licenseExpiresOn: { lte: expect.any(Date) } },
        orderBy: [{ licenseExpiresOn: 'asc' }, { id: 'asc' }],
      }),
    );
    expect(prisma.driver.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { branchId } }),
    );
  });
});

describe('DriversService.get', () => {
  it('finds a driver of the branch or answers not found', async () => {
    const { prisma, service } = setup();

    expect(await service.get(branchId, driverId)).toMatchObject({ id: driverId });
    prisma.driver.findFirst.mockResolvedValueOnce(null);
    await expect(service.get(branchId, driverId)).rejects.toThrow(NotFoundException);
  });
});

describe('DriversService.create', () => {
  it('creates the driver and queues DriverAdded in the same transaction, then flushes', async () => {
    const { tx, events, service } = setup();

    const driver = await service.create(branchId, fields, 'c');

    expect(tx.driver.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { ...fields, branchId, licenseExpiresOn: new Date('2027-03-01T00:00:00.000Z') },
      }),
    );
    expect(events.driver).toHaveBeenCalledWith(
      tx,
      'DriverAdded',
      expect.objectContaining({
        driverId,
        email: 'julio.perez@example.com',
        licenseExpiresOn: '2027-03-01',
        version: 1,
      }),
      'c',
    );
    expect(events.flush).toHaveBeenCalledTimes(1);
    expect(driver.id).toBe(driverId);
  });

  it('refuses a branch that is not active', async () => {
    const { tx, events, service } = setup();
    tx.branchCopy.findUnique.mockResolvedValue({ id: branchId, active: false });

    await expect(service.create(branchId, fields)).rejects.toThrow(
      new ConflictException('Tu sucursal no está activa.'),
    );
    expect(events.driver).not.toHaveBeenCalled();
  });

  it('tells a repeated licence from a repeated email', async () => {
    const { prisma, service } = setup();
    prisma.$transaction.mockRejectedValueOnce({
      code: 'P2002',
      meta: { driverAdapterError: { cause: { constraint: { fields: ['license_number'] } } } },
    });
    await expect(service.create(branchId, fields)).rejects.toThrow(
      new ConflictException('Ya existe un chofer con ese número de licencia.'),
    );

    prisma.$transaction.mockRejectedValueOnce({ code: 'P2002', meta: { target: ['email'] } });
    await expect(service.create(branchId, fields)).rejects.toThrow(
      new ConflictException('Ya existe un chofer con ese correo.'),
    );

    prisma.$transaction.mockRejectedValueOnce(new Error('boom'));
    await expect(service.create(branchId, fields)).rejects.toThrow('boom');
  });
});

describe('DriversService.update', () => {
  it('bumps the version and queues DriverUpdated', async () => {
    const { tx, events, service } = setup();

    const driver = await service.update(branchId, driverId, fields, 'c');

    expect(tx.driver.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: driverId },
        data: {
          ...fields,
          licenseExpiresOn: new Date('2027-03-01T00:00:00.000Z'),
          version: { increment: 1 },
        },
      }),
    );
    expect(events.driver).toHaveBeenCalledWith(
      tx,
      'DriverUpdated',
      expect.objectContaining({ version: 2 }),
      'c',
    );
    expect(events.flush).toHaveBeenCalledTimes(1);
    expect(driver.version).toBe(2);
  });

  it('answers not found for a driver of another branch', async () => {
    const { tx, service } = setup();
    tx.driver.findFirst.mockResolvedValue(null);

    await expect(service.update(branchId, driverId, fields)).rejects.toThrow(NotFoundException);
  });
});

describe('DriversService.setActive', () => {
  it('deactivates the driver, frees his bus and queues both events', async () => {
    const { tx, events, service } = setup();
    tx.bus.findUnique.mockResolvedValue(busRow);

    await service.setActive(branchId, driverId, false, 'c');

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.bus.update).toHaveBeenCalledWith({
      where: { id: busId },
      data: { assignedDriverId: null, version: { increment: 1 } },
    });
    expect(events.bus).toHaveBeenCalledWith(tx, 'BusUpdated', expect.anything(), 'c');
    expect(tx.driver.update).toHaveBeenCalledWith({
      where: { id: driverId },
      data: { active: false, version: { increment: 1 } },
    });
    expect(events.driver).toHaveBeenCalledWith(tx, 'DriverUpdated', expect.anything(), 'c');
    expect(events.flush).toHaveBeenCalledTimes(1);
  });

  it('has no bus to free for a driver without one', async () => {
    const { tx, events, service } = setup();

    await service.setActive(branchId, driverId, false);

    expect(tx.bus.update).not.toHaveBeenCalled();
    expect(events.bus).not.toHaveBeenCalled();
  });

  it('reactivates without touching buses', async () => {
    const { tx, events, service } = setup({ active: false });

    await service.setActive(branchId, driverId, true);

    expect(tx.bus.findUnique).not.toHaveBeenCalled();
    expect(tx.driver.update).toHaveBeenCalledWith({
      where: { id: driverId },
      data: { active: true, version: { increment: 1 } },
    });
    expect(events.flush).toHaveBeenCalledTimes(1);
  });

  it('refuses to deactivate while a trip is scheduled or on the road', async () => {
    const { tx, events, service } = setup();
    tx.tripCopy.findMany.mockResolvedValue([{ status: 'SCHEDULED' }]);

    await expect(service.setActive(branchId, driverId, false)).rejects.toThrow(
      new ConflictException(
        'Este chofer tiene viajes programados o en camino. Podrás desactivarlo cuando terminen o se eliminen.',
      ),
    );
    expect(tx.driver.update).not.toHaveBeenCalled();
    expect(events.flush).not.toHaveBeenCalled();
  });

  it('does nothing when the driver is already in the wanted state', async () => {
    const { tx, events, service } = setup();

    await service.setActive(branchId, driverId, true);

    expect(tx.driver.update).not.toHaveBeenCalled();
    expect(events.flush).not.toHaveBeenCalled();
  });
});

describe('DriversService photos', () => {
  const png = { data: Buffer.from([0x89, 0x50]), contentType: 'image/png' as const };

  it('stores the new photo, points the driver at it and then removes the old one', async () => {
    const { prisma, photos, service } = setup({ photoKey: 'drivers/old' });

    await service.savePhoto(branchId, driverId, png);

    expect(photos.save).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`^drivers/${driverId}/`)),
      png.data,
      'image/png',
    );
    expect(prisma.driver.update).toHaveBeenCalledWith({
      where: { id: driverId },
      data: { photoKey: expect.stringMatching(/^drivers\//) },
    });
    expect(photos.remove).toHaveBeenCalledWith('drivers/old');
  });

  it('has nothing to remove for a driver without photo', async () => {
    const { photos, service } = setup({ photoKey: null });

    await service.savePhoto(branchId, driverId, png);

    expect(photos.remove).not.toHaveBeenCalled();
  });

  it('reads the photo, or answers not found when there is none', async () => {
    const withPhoto = setup({ photoKey: 'drivers/k' });
    await expect(withPhoto.service.readPhoto(branchId, driverId)).resolves.toMatchObject({
      contentType: 'image/png',
    });

    const without = setup({ photoKey: null });
    await expect(without.service.readPhoto(branchId, driverId)).rejects.toThrow(NotFoundException);

    const lost = setup({ photoKey: 'drivers/k' });
    lost.photos.read.mockResolvedValue(null);
    await expect(lost.service.readPhoto(branchId, driverId)).rejects.toThrow(NotFoundException);
  });
});
