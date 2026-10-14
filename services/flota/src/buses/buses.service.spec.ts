import { ConflictException, NotFoundException } from '@nestjs/common';
import { FLEET_MESSAGES } from '../common/messages';
import { BusesService } from './buses.service';

const branchId = '9b2c7a10-1111-4c4c-8888-123456789abc';
const busId = '1f0e2d3c-4b5a-4968-8776-655443322110';
const driverId = '2a1b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const fields = {
  plate: 'C482BTX',
  brand: 'Volvo',
  model: 'B8R',
  year: 2021,
  capacity: 40,
  mileageKm: 1000,
  operationalStatus: 'AVAILABLE' as const,
  assignedDriverId: null,
};
const busRow = {
  id: busId,
  branchId,
  ...fields,
  active: true,
  inTransit: false,
  completedTrips: 0,
  photoKey: null,
  searchText: '',
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
  assignedDriver: null,
};

const setup = (over: { photoKey?: string | null } = {}) => {
  const tx = {
    branchCopy: { findUnique: jest.fn().mockResolvedValue({ id: branchId, active: true }) },
    bus: {
      findFirst: jest.fn().mockResolvedValue({ ...busRow, ...over }),
      create: jest.fn().mockResolvedValue(busRow),
      update: jest.fn().mockResolvedValue({ ...busRow, version: 2 }),
    },
    driver: { findUnique: jest.fn() },
    tripCopy: { findMany: jest.fn().mockResolvedValue([]) },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
  const prisma = {
    bus: {
      findMany: jest.fn().mockResolvedValue([busRow]),
      count: jest.fn().mockResolvedValue(1),
      groupBy: jest
        .fn()
        .mockResolvedValue([
          { active: true, inTransit: false, operationalStatus: 'AVAILABLE', _count: { _all: 1 } },
        ]),
      findFirst: jest.fn().mockResolvedValue({ ...busRow, ...over }),
      update: jest.fn().mockResolvedValue(busRow),
    },
    $transaction: jest.fn((work) => (Array.isArray(work) ? Promise.all(work) : work(tx))),
  };
  const events = {
    bus: jest.fn().mockResolvedValue(undefined),
    flush: jest.fn().mockResolvedValue(undefined),
  };
  const photos = {
    save: jest.fn().mockResolvedValue(undefined),
    read: jest.fn().mockResolvedValue({ data: Buffer.from('x'), contentType: 'image/jpeg' }),
    remove: jest.fn().mockResolvedValue(undefined),
  };
  return {
    tx,
    prisma,
    events,
    photos,
    service: new BusesService(prisma as never, events as never, photos as never),
  };
};

describe('BusesService.list', () => {
  it('pages the buses of the branch and counts every status of the branch', async () => {
    const { prisma, service } = setup();

    const page = await service.list(branchId, { status: 'all', page: 2, pageSize: 10 });

    expect(prisma.bus.findMany).toHaveBeenCalledWith({
      where: { branchId },
      include: { assignedDriver: { select: { fullName: true } } },
      orderBy: [{ plate: 'asc' }, { id: 'asc' }],
      skip: 10,
      take: 10,
    });
    expect(prisma.bus.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { branchId } }),
    );
    expect(page).toMatchObject({ total: 1, page: 2, pageSize: 10 });
    expect(page.summary.statusCounts).toEqual({
      IN_TRANSIT: 0,
      AVAILABLE: 1,
      IN_WORKSHOP: 0,
      INACTIVE: 0,
    });
  });

  it('filters by status and by the accent-free search, but counts without the tab', async () => {
    const { prisma, service } = setup();

    await service.list(branchId, { status: 'IN_WORKSHOP', q: 'volvo_', page: 1, pageSize: 20 });

    const scope = { branchId, searchText: { contains: 'volvo\\_' } };
    expect(prisma.bus.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ...scope, active: true, inTransit: false, operationalStatus: 'IN_WORKSHOP' },
      }),
    );
    expect(prisma.bus.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: scope }));
  });
});

describe('BusesService.get', () => {
  it('finds a bus of the branch or answers not found', async () => {
    const { prisma, service } = setup();

    expect(await service.get(branchId, busId)).toMatchObject({ id: busId });
    prisma.bus.findFirst.mockResolvedValueOnce(null);
    await expect(service.get(branchId, busId)).rejects.toThrow(NotFoundException);
  });
});

describe('BusesService.create', () => {
  it('creates the bus and queues BusAdded in the same transaction, then flushes', async () => {
    const { tx, events, service } = setup();

    const bus = await service.create(branchId, fields, 'c');

    expect(tx.bus.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { ...fields, branchId } }),
    );
    expect(events.bus).toHaveBeenCalledWith(
      tx,
      'BusAdded',
      expect.objectContaining({ busId, version: 1 }),
      'c',
    );
    expect(events.flush).toHaveBeenCalledTimes(1);
    expect(bus.id).toBe(busId);
  });

  it('refuses a branch that is not active', async () => {
    const { tx, events, service } = setup();
    tx.branchCopy.findUnique.mockResolvedValue({ id: branchId, active: false });

    await expect(service.create(branchId, fields)).rejects.toThrow(
      new ConflictException('Tu sucursal no está activa.'),
    );
    expect(events.bus).not.toHaveBeenCalled();
    expect(events.flush).not.toHaveBeenCalled();
  });

  it('refuses a driver that is not an active one of the branch', async () => {
    const { tx, service } = setup();
    tx.driver.findUnique.mockResolvedValue({ branchId: 'x', active: true, assignedBus: null });

    await expect(
      service.create(branchId, { ...fields, assignedDriverId: driverId }),
    ).rejects.toThrow(new ConflictException('Elige un chofer activo de tu sucursal.'));
    tx.driver.findUnique.mockResolvedValue(null);
    await expect(
      service.create(branchId, { ...fields, assignedDriverId: driverId }),
    ).rejects.toThrow(ConflictException);
  });

  it('refuses a driver who already has another bus', async () => {
    const { tx, service } = setup();
    tx.driver.findUnique.mockResolvedValue({
      branchId,
      active: true,
      assignedBus: { id: 'other' },
    });

    await expect(
      service.create(branchId, { ...fields, assignedDriverId: driverId }),
    ).rejects.toThrow(new ConflictException('Ese chofer ya está asignado a otro bus.'));
  });

  it('turns a repeated plate or driver into a clear conflict', async () => {
    const { prisma, service } = setup();
    prisma.$transaction.mockRejectedValueOnce({ code: 'P2002', meta: { target: ['plate'] } });
    await expect(service.create(branchId, fields)).rejects.toThrow(
      new ConflictException('Ya existe un bus con esa placa.'),
    );

    prisma.$transaction.mockRejectedValueOnce({
      code: 'P2002',
      meta: { driverAdapterError: { cause: { constraint: { fields: ['assigned_driver_id'] } } } },
    });
    await expect(service.create(branchId, fields)).rejects.toThrow(
      new ConflictException('Ese chofer ya está asignado a otro bus.'),
    );

    prisma.$transaction.mockRejectedValueOnce(new Error('boom'));
    await expect(service.create(branchId, fields)).rejects.toThrow('boom');
  });
});

describe('BusesService.update', () => {
  it('bumps the version and queues BusUpdated', async () => {
    const { tx, events, service } = setup();

    const bus = await service.update(branchId, busId, fields, 'c');

    expect(tx.bus.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: busId },
        data: { ...fields, version: { increment: 1 } },
      }),
    );
    expect(events.bus).toHaveBeenCalledWith(
      tx,
      'BusUpdated',
      expect.objectContaining({ version: 2 }),
      'c',
    );
    expect(events.flush).toHaveBeenCalledTimes(1);
    expect(bus.version).toBe(2);
  });

  it('rejects an edit that lowers the mileage, without queuing any event', async () => {
    const { tx, events, service } = setup();
    tx.bus.findFirst.mockResolvedValue({ ...busRow, mileageKm: 1200 });

    await expect(service.update(branchId, busId, { ...fields, mileageKm: 1000 })).rejects.toThrow(
      new ConflictException(FLEET_MESSAGES.mileageDecrease),
    );

    expect(tx.bus.update).not.toHaveBeenCalled();
    expect(events.bus).not.toHaveBeenCalled();
  });

  it('locks the bus first, so a completed trip that raises the mileage is never overwritten', async () => {
    const { tx, service } = setup();

    await service.update(branchId, busId, fields);

    expect(tx.$queryRaw).toHaveBeenCalled();
  });

  it('keeps the own driver assignable and answers not found for a bus of another branch', async () => {
    const { tx, service } = setup();
    tx.driver.findUnique.mockResolvedValue({ branchId, active: true, assignedBus: { id: busId } });

    await expect(
      service.update(branchId, busId, { ...fields, assignedDriverId: driverId }),
    ).resolves.toBeDefined();

    tx.bus.findFirst.mockResolvedValue(null);
    await expect(service.update(branchId, busId, fields)).rejects.toThrow(NotFoundException);
  });
});

describe('BusesService.setActive', () => {
  it('locks the bus, deactivates it, lets its driver go and queues BusDeactivated', async () => {
    const { tx, events, service } = setup();

    await service.setActive(branchId, busId, false, 'c');

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.bus.update).toHaveBeenCalledWith({
      where: { id: busId },
      data: { active: false, version: { increment: 1 }, assignedDriverId: null },
    });
    expect(events.bus).toHaveBeenCalledWith(tx, 'BusDeactivated', expect.anything(), 'c');
    expect(events.flush).toHaveBeenCalledTimes(1);
  });

  it('reactivates with BusUpdated and keeps the driver untouched', async () => {
    const { tx, events, service } = setup();
    tx.bus.findFirst.mockResolvedValue({ ...busRow, active: false });

    await service.setActive(branchId, busId, true);

    expect(tx.bus.update).toHaveBeenCalledWith({
      where: { id: busId },
      data: { active: true, version: { increment: 1 } },
    });
    expect(events.bus).toHaveBeenCalledWith(tx, 'BusUpdated', expect.anything(), undefined);
  });

  it('refuses to deactivate while a trip is scheduled or on the road', async () => {
    const { tx, events, service } = setup();
    tx.tripCopy.findMany.mockResolvedValue([{ status: 'IN_TRANSIT' }]);

    await expect(service.setActive(branchId, busId, false)).rejects.toThrow(ConflictException);
    expect(tx.bus.update).not.toHaveBeenCalled();
    expect(events.flush).not.toHaveBeenCalled();
  });

  it('does nothing when the bus is already in the wanted state', async () => {
    const { tx, events, service } = setup();

    await service.setActive(branchId, busId, true);

    expect(tx.bus.update).not.toHaveBeenCalled();
    expect(events.bus).not.toHaveBeenCalled();
    expect(events.flush).not.toHaveBeenCalled();
  });
});

describe('BusesService photos', () => {
  const jpeg = { data: Buffer.from([0xff, 0xd8, 0xff]), contentType: 'image/jpeg' as const };

  it('stores the new photo, points the bus at it and then removes the old one', async () => {
    const { prisma, photos, service } = setup({ photoKey: 'buses/old' });

    await service.savePhoto(branchId, busId, jpeg);

    expect(photos.save).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`^buses/${busId}/`)),
      jpeg.data,
      'image/jpeg',
    );
    expect(prisma.bus.update).toHaveBeenCalledWith({
      where: { id: busId },
      data: { photoKey: expect.stringMatching(/^buses\//) },
    });
    expect(photos.remove).toHaveBeenCalledWith('buses/old');
  });

  it('has nothing to remove for a bus without photo', async () => {
    const { photos, service } = setup({ photoKey: null });

    await service.savePhoto(branchId, busId, jpeg);

    expect(photos.remove).not.toHaveBeenCalled();
  });

  it('reads the photo, or answers not found when there is none', async () => {
    const withPhoto = setup({ photoKey: 'buses/k' });
    await expect(withPhoto.service.readPhoto(branchId, busId)).resolves.toMatchObject({
      contentType: 'image/jpeg',
    });
    expect(withPhoto.photos.read).toHaveBeenCalledWith('buses/k');

    const without = setup({ photoKey: null });
    await expect(without.service.readPhoto(branchId, busId)).rejects.toThrow(NotFoundException);

    const lost = setup({ photoKey: 'buses/k' });
    lost.photos.read.mockResolvedValue(null);
    await expect(lost.service.readPhoto(branchId, busId)).rejects.toThrow(NotFoundException);
  });
});
