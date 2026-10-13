import { ConflictException, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { TripsService } from './trips.service';

const branchId = '9b2c7a10-1111-4c4c-8888-123456789abc';
const destinationId = '5d1f3a20-2222-4d4d-9999-123456789abc';
const routeId = '3b2c1d0e-6f5a-4b4c-9d8e-7f6a5b4c3d2e';
const busId = '1f0e2d3c-4b5a-4968-8776-655443322110';
const driverId = '2a1b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const actor = {
  userId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  role: 'BRANCH_ADMIN' as const,
  branchId,
};
const input = {
  routeId,
  busId,
  driverId,
  departureAt: '2999-10-20T12:00:00.000Z',
  estimatedArrivalAt: '2999-10-20T16:00:00.000Z',
};
const tripRow = {
  id: 'f4c3b2a1-0000-4000-8000-000000000000',
  type: 'REGULAR' as const,
  status: 'SCHEDULED' as const,
  branchId,
  routeId,
  busId,
  busPlate: 'C482BTX',
  capacity: 40,
  driverId,
  driverName: 'Julio Pérez',
  originLabel: 'Quetzaltenango',
  destinationLabel: 'Guatemala',
  departureAt: new Date(input.departureAt),
  estimatedArrivalAt: new Date(input.estimatedArrivalAt),
  ticketPrice: new Prisma.Decimal('85.00'),
  rentalId: null,
  createdById: actor.userId,
  searchText: '',
  createdAt: new Date(),
  updatedAt: new Date(),
};
const routeCopy = {
  id: routeId,
  originBranchId: branchId,
  destinationBranchId: destinationId,
  ticketPrice: new Prisma.Decimal('85.00'),
  active: true,
  deleted: false,
};
const busCopy = { id: busId, plate: 'C482BTX', capacity: 40, active: true };
const driverCopy = { id: driverId, fullName: 'Julio Pérez', active: true };

const setup = () => {
  const tx = {
    trip: { create: jest.fn().mockResolvedValue(tripRow) },
    busCopy: { findUnique: jest.fn().mockResolvedValue(busCopy) },
    driverCopy: { findUnique: jest.fn().mockResolvedValue(driverCopy) },
    $executeRawUnsafe: jest.fn().mockResolvedValue(1),
  };
  const prisma = {
    routeCopy: { findUnique: jest.fn().mockResolvedValue(routeCopy) },
    busCopy: { findUnique: jest.fn().mockResolvedValue(busCopy) },
    driverCopy: { findUnique: jest.fn().mockResolvedValue(driverCopy) },
    branchCopy: {
      findUnique: jest.fn(
        ({ where }: { where: { id: string } }): Promise<{ id: string; name: string } | null> =>
          Promise.resolve({
            id: where.id,
            name: where.id === branchId ? 'Quetzaltenango' : 'Guatemala',
          }),
      ),
    },
    $transaction: jest.fn((work) => work(tx)),
  };
  const fleet = {
    availability: jest
      .fn()
      .mockResolvedValue({ bus: { available: true }, driver: { available: true } }),
  };
  const outbox = {
    add: jest.fn().mockResolvedValue({}),
    flush: jest.fn().mockResolvedValue({}),
  };
  return {
    tx,
    prisma,
    fleet,
    outbox,
    service: new TripsService(prisma as never, fleet as never, outbox as never),
  };
};

describe('TripsService.schedule', () => {
  it('asks flota, writes the trip and queues TripScheduled in one transaction, then flushes', async () => {
    const { tx, fleet, outbox, service } = setup();

    const trip = await service.schedule(actor, input, 'c');

    expect(fleet.availability).toHaveBeenCalledWith(
      {
        branchId,
        busId,
        driverId,
        departureAt: input.departureAt,
        estimatedArrivalAt: input.estimatedArrivalAt,
      },
      'c',
    );
    expect(tx.trip.create).toHaveBeenCalledWith({
      data: {
        type: 'REGULAR',
        status: 'SCHEDULED',
        branchId,
        routeId,
        busId,
        busPlate: 'C482BTX',
        capacity: 40,
        driverId,
        driverName: 'Julio Pérez',
        originLabel: 'Quetzaltenango',
        destinationLabel: 'Guatemala',
        departureAt: new Date(input.departureAt),
        estimatedArrivalAt: new Date(input.estimatedArrivalAt),
        ticketPrice: routeCopy.ticketPrice,
        createdById: actor.userId,
      },
    });
    expect(outbox.add).toHaveBeenCalledWith(
      tx,
      'TripScheduled',
      expect.objectContaining({ tripId: tripRow.id, busId, ticketPrice: 85 }),
      'c',
    );
    expect(outbox.flush).toHaveBeenCalledTimes(1);
    expect(trip).toMatchObject({ id: tripRow.id, busPlate: 'C482BTX', ticketPrice: 85 });
  });

  it('refuses before calling flota when the local copies already say no', async () => {
    const { prisma, fleet, service } = setup();
    prisma.routeCopy.findUnique.mockResolvedValue({ ...routeCopy, active: false });

    await expect(service.schedule(actor, input)).rejects.toThrow(
      new ConflictException('Esa ruta está retirada. Reactívala o elige otra.'),
    );
    expect(fleet.availability).not.toHaveBeenCalled();

    prisma.routeCopy.findUnique.mockResolvedValue(null);
    await expect(service.schedule(actor, input)).rejects.toThrow(ConflictException);
    prisma.routeCopy.findUnique.mockResolvedValue(routeCopy);
    prisma.busCopy.findUnique.mockResolvedValue(null);
    await expect(service.schedule(actor, input)).rejects.toThrow(
      new ConflictException(
        'Estamos terminando de registrar ese bus. Intenta de nuevo en unos segundos.',
      ),
    );
  });

  it('refuses a departure in the past', async () => {
    const { service } = setup();

    await expect(
      service.schedule(actor, {
        ...input,
        departureAt: '2020-10-20T12:00:00.000Z',
        estimatedArrivalAt: '2020-10-20T16:00:00.000Z',
      }),
    ).rejects.toThrow(new ConflictException('La salida debe ser en el futuro.'));
  });

  it('answers with the reason that flota gives and writes nothing', async () => {
    const { tx, fleet, outbox, service } = setup();
    fleet.availability.mockResolvedValue({
      bus: { available: false, reason: 'IN_WORKSHOP' },
      driver: { available: true },
    });

    await expect(service.schedule(actor, input)).rejects.toThrow(
      new ConflictException('Ese bus está en taller.'),
    );
    expect(tx.trip.create).not.toHaveBeenCalled();
    expect(outbox.add).not.toHaveBeenCalled();
    expect(outbox.flush).not.toHaveBeenCalled();
  });

  it('lets the failure of flota through, so the caller answers it', async () => {
    const { fleet, service } = setup();
    fleet.availability.mockRejectedValue(new Error('flota down'));

    await expect(service.schedule(actor, input)).rejects.toThrow('flota down');
  });

  it('refuses a route whose branches are not known yet', async () => {
    const { prisma, service } = setup();
    prisma.branchCopy.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve(where.id === destinationId ? null : { id: where.id, name: 'Origen' }),
    );

    await expect(service.schedule(actor, input)).rejects.toThrow(
      new ConflictException('Elige una ruta activa que salga de tu sucursal.'),
    );
  });

  it('checks the bus and the driver again inside the transaction, in case they were deactivated meanwhile', async () => {
    const { tx, outbox, service } = setup();
    tx.busCopy.findUnique.mockResolvedValue({ ...busCopy, active: false });

    await expect(service.schedule(actor, input)).rejects.toThrow(
      new ConflictException('Ese bus está desactivado.'),
    );

    tx.busCopy.findUnique.mockResolvedValue(busCopy);
    tx.driverCopy.findUnique.mockResolvedValue({ ...driverCopy, active: false });
    await expect(service.schedule(actor, input)).rejects.toThrow(
      new ConflictException('Ese chofer está desactivado.'),
    );
    tx.driverCopy.findUnique.mockResolvedValue(null);
    await expect(service.schedule(actor, input)).rejects.toThrow(ConflictException);
    expect(tx.trip.create).not.toHaveBeenCalled();
    expect(outbox.flush).not.toHaveBeenCalled();
  });

  it('turns the exclusion constraints into the text of the busy bus or driver', async () => {
    const { prisma, outbox, service } = setup();
    prisma.$transaction.mockRejectedValueOnce(new Error('violates "trips_bus_no_overlap"'));
    await expect(service.schedule(actor, input)).rejects.toThrow(
      new ConflictException('Ese bus ya tiene un viaje en ese horario.'),
    );

    prisma.$transaction.mockRejectedValueOnce({ message: 'violates "trips_driver_no_overlap"' });
    await expect(service.schedule(actor, input)).rejects.toThrow(
      new ConflictException('Ese chofer ya tiene un viaje en ese horario.'),
    );

    prisma.$transaction.mockRejectedValueOnce(new Error('boom'));
    await expect(service.schedule(actor, input)).rejects.toThrow('boom');
    expect(outbox.flush).not.toHaveBeenCalled();
  });

  it('tries again when the database asks to retry a deadlock, and then reports the busy bus', async () => {
    const { prisma, outbox, service } = setup();
    prisma.$transaction
      .mockRejectedValueOnce({ code: 'P2034' })
      .mockRejectedValueOnce(new Error('violates "trips_bus_no_overlap"'));

    await expect(service.schedule(actor, input)).rejects.toThrow(
      new ConflictException('Ese bus ya tiene un viaje en ese horario.'),
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(outbox.flush).not.toHaveBeenCalled();
  });

  it('schedules the trip when the retry after a deadlock goes through', async () => {
    const { prisma, outbox, service } = setup();
    prisma.$transaction.mockRejectedValueOnce({ code: 'P2034' });

    const trip = await service.schedule(actor, input);

    expect(trip.id).toBe(tripRow.id);
    expect(outbox.flush).toHaveBeenCalledTimes(1);
  });

  it('gives up after five deadlocks with an honest conflict, never a server error', async () => {
    const { prisma, outbox, service } = setup();
    prisma.$transaction.mockRejectedValue({ code: 'P2034' });

    await expect(service.schedule(actor, input)).rejects.toThrow(
      new ConflictException(
        'Otro viaje se está programando justo ahora. Intenta de nuevo en unos segundos.',
      ),
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(5);
    expect(outbox.flush).not.toHaveBeenCalled();
  });

  it('queues trips of the same bus and driver with an advisory lock per bus and then per driver, before writing', async () => {
    const { tx, service } = setup();

    await service.schedule(actor, input);

    expect(tx.$executeRawUnsafe.mock.calls).toEqual([
      ['SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', `trip-bus:${busId}`],
      ['SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', `trip-driver:${driverId}`],
    ]);
    const order = (mock: jest.Mock) => mock.mock.invocationCallOrder[0] ?? 0;
    expect(order(tx.$executeRawUnsafe)).toBeLessThan(order(tx.trip.create));
    expect(order(tx.busCopy.findUnique)).toBeGreaterThan(order(tx.$executeRawUnsafe));
  });

  it('logs the code of every retry, so a slow answer can be traced', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const { prisma, service } = setup();
    prisma.$transaction
      .mockRejectedValueOnce({ code: 'P2034' })
      .mockRejectedValueOnce({ code: 'P2028' });

    await service.schedule(actor, input);

    expect(warn).toHaveBeenNthCalledWith(
      1,
      { attempt: 1, code: 'P2034' },
      'Trying the trip again after a database conflict',
    );
    expect(warn).toHaveBeenNthCalledWith(
      2,
      { attempt: 2, code: 'P2028' },
      'Trying the trip again after a database conflict',
    );
    warn.mockRestore();
  });

  it('lets the transaction wait for a connection while simultaneous trips queue for the same hours', async () => {
    const { prisma, service } = setup();

    await service.schedule(actor, input);

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { maxWait: 10_000 });
  });

  it('refuses a session without a branch', async () => {
    const { service } = setup();

    await expect(service.schedule({ ...actor, branchId: null }, input)).rejects.toThrow();
  });
});

describe('TripsService.list and get', () => {
  const lists = () => {
    const prisma = {
      trip: {
        findMany: jest.fn().mockResolvedValue([tripRow]),
        count: jest.fn().mockResolvedValue(1),
        findFirst: jest.fn().mockResolvedValue(tripRow),
      },
      $transaction: jest.fn((work) => Promise.all(work)),
    };
    return { prisma, service: new TripsService(prisma as never, {} as never, {} as never) };
  };

  it('pages the trips of the branch by departure, within the days that were asked', async () => {
    const { prisma, service } = lists();

    const page = await service.list(branchId, {
      from: '2999-10-20',
      to: '2999-10-20',
      status: 'SCHEDULED',
      page: 2,
      pageSize: 10,
    });

    expect(prisma.trip.findMany).toHaveBeenCalledWith({
      where: {
        branchId,
        status: 'SCHEDULED',
        departureAt: {
          gte: new Date('2999-10-20T06:00:00.000Z'),
          lt: new Date('2999-10-21T06:00:00.000Z'),
        },
      },
      orderBy: [{ departureAt: 'asc' }, { id: 'asc' }],
      skip: 10,
      take: 10,
    });
    expect(prisma.trip.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ branchId }),
    });
    expect(page).toMatchObject({ total: 1, page: 2, pageSize: 10 });
    expect(page.items[0]).toMatchObject({ id: tripRow.id, busPlate: 'C482BTX' });
  });

  it('finds a trip of the branch or answers not found', async () => {
    const { prisma, service } = lists();

    expect(await service.get(branchId, tripRow.id)).toMatchObject({ id: tripRow.id });
    expect(prisma.trip.findFirst).toHaveBeenCalledWith({ where: { id: tripRow.id, branchId } });
    prisma.trip.findFirst.mockResolvedValueOnce(null);
    await expect(service.get(branchId, tripRow.id)).rejects.toThrow(
      new NotFoundException('No encontramos ese viaje.'),
    );
  });
});
