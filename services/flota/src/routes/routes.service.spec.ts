import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { RoutesService } from './routes.service';

const origin = '9b2c7a10-1111-4c4c-8888-123456789abc';
const destination = '5d1f3a20-2222-4d4d-9999-123456789abc';
const routeId = '3b2c1d0e-6f5a-4b4c-9d8e-7f6a5b4c3d2e';
const input = { destinationBranchId: destination, distanceKm: 201.5, ticketPrice: 85 };
const routeRow = {
  id: routeId,
  originBranchId: origin,
  destinationBranchId: destination,
  distanceKm: new Prisma.Decimal('201.5'),
  ticketPrice: new Prisma.Decimal('85.00'),
  active: true,
  hasTrips: false,
  searchText: '',
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
  origin: { name: 'Quetzaltenango' },
  destination: { name: 'Guatemala' },
};

const setup = (over: { hasTrips?: boolean } = {}) => {
  const tx = {
    branchCopy: {
      findUnique: jest.fn(
        ({ where }: { where: { id: string } }): Promise<{ id: string; active: boolean } | null> =>
          Promise.resolve({ id: where.id, active: true }),
      ),
    },
    route: {
      findFirst: jest.fn().mockResolvedValue({ ...routeRow, ...over }),
      create: jest.fn().mockResolvedValue(routeRow),
      update: jest.fn().mockResolvedValue({ ...routeRow, version: 2 }),
      delete: jest.fn().mockResolvedValue(routeRow),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
  const prisma = {
    route: {
      findMany: jest.fn().mockResolvedValue([routeRow]),
      count: jest.fn().mockResolvedValue(1),
      groupBy: jest.fn().mockResolvedValue([{ active: true, _count: { _all: 1 } }]),
    },
    $transaction: jest.fn((work) => (Array.isArray(work) ? Promise.all(work) : work(tx))),
  };
  const events = {
    route: jest.fn().mockResolvedValue(undefined),
    flush: jest.fn().mockResolvedValue(undefined),
  };
  return { tx, prisma, events, service: new RoutesService(prisma as never, events as never) };
};

describe('RoutesService.list', () => {
  it('pages the routes that leave the branch, ordered by destination, with tab counts', async () => {
    const { prisma, service } = setup();

    const page = await service.list(origin, { status: 'active', page: 1, pageSize: 20 });

    expect(prisma.route.findMany).toHaveBeenCalledWith({
      where: { originBranchId: origin, active: true },
      include: { origin: { select: { name: true } }, destination: { select: { name: true } } },
      orderBy: [{ destination: { name: 'asc' } }, { id: 'asc' }],
      skip: 0,
      take: 20,
    });
    expect(prisma.route.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ by: ['active'], where: { originBranchId: origin } }),
    );
    expect(page.summary.statusCounts).toEqual({ active: 1, inactive: 0 });
  });

  it('filters by status and by the accent-free search of the destination', async () => {
    const { prisma, service } = setup();

    await service.list(origin, { status: 'inactive', q: 'quetzal', page: 3, pageSize: 10 });

    expect(prisma.route.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { originBranchId: origin, active: false, searchText: { contains: 'quetzal' } },
        skip: 20,
        take: 10,
      }),
    );
    expect(prisma.route.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { originBranchId: origin, searchText: { contains: 'quetzal' } },
      }),
    );
  });
});

describe('RoutesService.create', () => {
  it('creates the route and queues RouteCreated in the same transaction, then flushes', async () => {
    const { tx, events, service } = setup();

    const route = await service.create(origin, input, 'c');

    expect(tx.route.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          originBranchId: origin,
          destinationBranchId: destination,
          distanceKm: 201.5,
          ticketPrice: 85,
        },
      }),
    );
    expect(events.route).toHaveBeenCalledWith(
      tx,
      'RouteCreated',
      expect.objectContaining({ routeId, version: 1 }),
      'c',
    );
    expect(events.flush).toHaveBeenCalledTimes(1);
    expect(route.destinationName).toBe('Guatemala');
  });

  it('refuses the own branch, an inactive branch and one that does not exist as destination', async () => {
    const { tx, events, service } = setup();
    const message = 'Elige otra sucursal activa como destino.';

    await expect(service.create(origin, { ...input, destinationBranchId: origin })).rejects.toThrow(
      new ConflictException(message),
    );
    tx.branchCopy.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve({ id: where.id, active: where.id !== destination }),
    );
    await expect(service.create(origin, input)).rejects.toThrow(new ConflictException(message));
    tx.branchCopy.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve(where.id === destination ? null : { id: where.id, active: true }),
    );
    await expect(service.create(origin, input)).rejects.toThrow(new ConflictException(message));
    expect(events.route).not.toHaveBeenCalled();
  });

  it('refuses a branch of its own that is not active', async () => {
    const { tx, service } = setup();
    tx.branchCopy.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve({ id: where.id, active: where.id !== origin }),
    );

    await expect(service.create(origin, input)).rejects.toThrow(
      new ConflictException('Tu sucursal no está activa.'),
    );
  });

  it('turns a repeated pair into a clear conflict', async () => {
    const { prisma, service } = setup();
    prisma.$transaction.mockRejectedValueOnce({
      code: 'P2002',
      meta: { target: ['origin_branch_id'] },
    });

    await expect(service.create(origin, input)).rejects.toThrow(
      new ConflictException(
        'Ya existe una ruta hacia esa sucursal. Edítala en lugar de crear otra.',
      ),
    );

    prisma.$transaction.mockRejectedValueOnce(new Error('boom'));
    await expect(service.create(origin, input)).rejects.toThrow('boom');
  });
});

describe('RoutesService.update', () => {
  it('changes distance, price and availability, bumps the version and queues RouteUpdated', async () => {
    const { tx, events, service } = setup();

    const route = await service.update(
      origin,
      routeId,
      { distanceKm: 210, ticketPrice: 90, active: false },
      'c',
    );

    expect(tx.route.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: routeId },
        data: { distanceKm: 210, ticketPrice: 90, active: false, version: { increment: 1 } },
      }),
    );
    expect(events.route).toHaveBeenCalledWith(
      tx,
      'RouteUpdated',
      expect.objectContaining({ version: 2 }),
      'c',
    );
    expect(events.flush).toHaveBeenCalledTimes(1);
    expect(route.version).toBe(2);
  });

  it('answers not found for a route of another branch', async () => {
    const { tx, service } = setup();
    tx.route.findFirst.mockResolvedValue(null);

    await expect(
      service.update(origin, routeId, { distanceKm: 1, ticketPrice: 1, active: true }),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('RoutesService.remove', () => {
  it('locks the route, deletes it and queues RouteDeleted', async () => {
    const { tx, events, service } = setup();

    await service.remove(origin, routeId, 'c');

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.route.delete).toHaveBeenCalledWith({ where: { id: routeId } });
    expect(events.route).toHaveBeenCalledWith(tx, 'RouteDeleted', { routeId }, 'c');
    expect(events.flush).toHaveBeenCalledTimes(1);
  });

  it('keeps a route that already had trips', async () => {
    const { tx, events, service } = setup({ hasTrips: true });

    await expect(service.remove(origin, routeId)).rejects.toThrow(
      new ConflictException(
        'Esta ruta ya tiene viajes. Puedes retirarla para que no se programen más.',
      ),
    );
    expect(tx.route.delete).not.toHaveBeenCalled();
    expect(events.flush).not.toHaveBeenCalled();
  });

  it('answers not found for a route of another branch', async () => {
    const { tx, service } = setup();
    tx.route.findFirst.mockResolvedValue(null);

    await expect(service.remove(origin, routeId)).rejects.toThrow(NotFoundException);
  });
});
