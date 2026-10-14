import { tripScheduledPayloadSchema } from '@debus/contracts';
import { REQUEST_FLUSH } from '@debus/messaging';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { TripWrites } from '../trips/trip-writes';
import { RentalRequestsService } from './rental-requests.service';

const branchId = '9b2c7a10-1111-4c4c-8888-123456789abc';
const busId = '1f0e2d3c-4b5a-4968-8776-655443322110';
const driverId = '2a1b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const rentalId = '5d1f3a20-2222-4d4d-9999-123456789abc';
const actor = {
  userId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  role: 'BRANCH_ADMIN' as const,
  branchId,
};
const input = { busId, driverId, estimatedArrivalAt: '2999-10-24T23:00:00.000Z' };
const requestRow = {
  id: rentalId,
  branchId,
  clientName: 'Colegio San José',
  nit: '1234567-8',
  originLabel: 'Quetzaltenango',
  destinationLabel: 'Panajachel',
  departureAt: new Date('2999-10-24T13:00:00.000Z'),
  returnAt: null,
  passengers: 35,
  distanceKm: new Prisma.Decimal('92.0'),
  price: new Prisma.Decimal('2760.00'),
  status: 'PENDING' as const,
  tripId: null,
  searchText: '',
  createdAt: new Date(),
  updatedAt: new Date(),
};
const tripRow = {
  id: 'f4c3b2a1-0000-4000-8000-000000000000',
  type: 'RENTAL' as const,
  status: 'SCHEDULED' as const,
  branchId,
  routeId: null,
  busId,
  busPlate: 'C482BTX',
  capacity: 40,
  driverId,
  driverName: 'Julio Pérez',
  originLabel: 'Quetzaltenango',
  destinationLabel: 'Panajachel',
  departureAt: requestRow.departureAt,
  estimatedArrivalAt: new Date(input.estimatedArrivalAt),
  ticketPrice: null,
  rentalId,
  createdById: actor.userId,
  searchText: '',
  createdAt: new Date(),
  updatedAt: new Date(),
};
const busCopy = { id: busId, branchId, plate: 'C482BTX', capacity: 40, active: true };
const driverCopy = { id: driverId, branchId, fullName: 'Julio Pérez', active: true };

const setup = () => {
  const tx = {
    $executeRawUnsafe: jest.fn().mockResolvedValue(1),
    $queryRawUnsafe: jest.fn().mockResolvedValue([]),
    busCopy: { findUnique: jest.fn().mockResolvedValue(busCopy) },
    driverCopy: { findUnique: jest.fn().mockResolvedValue(driverCopy) },
    routeCopy: { findUnique: jest.fn() },
    trip: { create: jest.fn().mockResolvedValue(tripRow) },
    rentalRequest: {
      findUnique: jest.fn().mockResolvedValue(requestRow),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const prisma = {
    rentalRequest: {
      findMany: jest.fn().mockResolvedValue([requestRow]),
      count: jest.fn().mockResolvedValue(1),
      findFirst: jest.fn().mockResolvedValue(requestRow),
    },
    busCopy: { findUnique: jest.fn().mockResolvedValue(busCopy) },
    driverCopy: { findUnique: jest.fn().mockResolvedValue(driverCopy) },
    $transaction: jest.fn((work) => (Array.isArray(work) ? Promise.all(work) : work(tx))),
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
    service: new RentalRequestsService(
      prisma as never,
      fleet as never,
      outbox as never,
      new TripWrites(prisma as never),
    ),
  };
};

describe('RentalRequestsService.list', () => {
  it('pages the requests of the branch by departure, filtered by status and search', async () => {
    const { prisma, service } = setup();

    const page = await service.list(branchId, {
      status: 'PENDING',
      q: 'colegio',
      page: 2,
      pageSize: 10,
    });

    expect(prisma.rentalRequest.findMany).toHaveBeenCalledWith({
      where: { branchId, status: 'PENDING', searchText: { contains: 'colegio' } },
      orderBy: [{ departureAt: 'asc' }, { id: 'asc' }],
      skip: 10,
      take: 10,
    });
    expect(prisma.rentalRequest.count).toHaveBeenCalledWith({
      where: { branchId, status: 'PENDING', searchText: { contains: 'colegio' } },
    });
    expect(page).toMatchObject({ total: 1, page: 2, pageSize: 10 });
    expect(page.items[0]).toMatchObject({ id: rentalId, price: 2760, distanceKm: 92 });
  });
});

describe('RentalRequestsService.assign', () => {
  it('asks flota, gives the rental a trip, marks it assigned and queues TripScheduled, then flushes', async () => {
    const { tx, prisma, fleet, outbox, service } = setup();

    const trip = await service.assign(actor, rentalId, input, 'c');

    expect(prisma.rentalRequest.findFirst).toHaveBeenCalledWith({
      where: { id: rentalId, branchId },
    });
    expect(fleet.availability).toHaveBeenCalledWith(
      {
        branchId,
        busId,
        driverId,
        departureAt: requestRow.departureAt.toISOString(),
        estimatedArrivalAt: input.estimatedArrivalAt,
      },
      'c',
    );
    expect(tx.$queryRawUnsafe).toHaveBeenCalledWith(
      'SELECT id FROM rental_requests WHERE id = $1::uuid FOR UPDATE',
      rentalId,
    );
    expect(tx.trip.create).toHaveBeenCalledWith({
      data: {
        type: 'RENTAL',
        status: 'SCHEDULED',
        branchId,
        routeId: null,
        busId,
        busPlate: 'C482BTX',
        capacity: 40,
        driverId,
        driverName: 'Julio Pérez',
        originLabel: 'Quetzaltenango',
        destinationLabel: 'Panajachel',
        departureAt: requestRow.departureAt,
        estimatedArrivalAt: new Date(input.estimatedArrivalAt),
        ticketPrice: null,
        rentalId,
        createdById: actor.userId,
      },
    });
    expect(tx.rentalRequest.update).toHaveBeenCalledWith({
      where: { id: rentalId },
      data: { status: 'ASSIGNED', tripId: tripRow.id },
    });
    expect(outbox.add).toHaveBeenCalledWith(
      tx,
      'TripScheduled',
      expect.objectContaining({ tripId: tripRow.id, type: 'RENTAL', rentalId, routeId: null }),
      'c',
    );
    const payload = outbox.add.mock.calls[0]?.[2];
    expect(tripScheduledPayloadSchema.parse(payload)).toEqual(payload);
    expect(outbox.flush).toHaveBeenCalledWith(REQUEST_FLUSH);
    expect(trip).toMatchObject({ id: tripRow.id, type: 'RENTAL', ticketPrice: null });
  });

  it.each([
    ['rental of another branch or unknown', 'No encontramos ese alquiler.'],
    ['rental already assigned', 'Ese alquiler ya tiene bus y chofer.'],
    ['bus too small', 'Ese bus tiene menos asientos que pasajeros del alquiler.'],
    ['bus of another branch', 'No encontramos ese bus en tu sucursal.'],
    ['driver deactivated', 'Ese chofer está desactivado.'],
    ['arrival that already passed', 'La llegada estimada ya pasó'],
    [
      'arrival before the return',
      'La llegada estimada no puede ser antes del regreso del cliente.',
    ],
  ])('refuses a %s before calling flota', async (name, text) => {
    const { prisma, fleet, outbox, service } = setup();
    if (name.startsWith('rental of')) prisma.rentalRequest.findFirst.mockResolvedValue(null);
    if (name === 'rental already assigned') {
      prisma.rentalRequest.findFirst.mockResolvedValue({ ...requestRow, status: 'ASSIGNED' });
    }
    if (name === 'bus too small') {
      prisma.busCopy.findUnique.mockResolvedValue({ ...busCopy, capacity: 20 });
    }
    if (name === 'bus of another branch') {
      prisma.busCopy.findUnique.mockResolvedValue({ ...busCopy, branchId: 'otra' });
    }
    if (name === 'arrival that already passed') {
      prisma.rentalRequest.findFirst.mockResolvedValue({
        ...requestRow,
        departureAt: new Date('2000-01-01T08:00:00.000Z'),
      });
    }
    if (name === 'arrival before the return') {
      prisma.rentalRequest.findFirst.mockResolvedValue({
        ...requestRow,
        returnAt: new Date('2999-10-25T08:00:00.000Z'),
      });
    }
    if (name === 'driver deactivated') {
      prisma.driverCopy.findUnique.mockResolvedValue({ ...driverCopy, active: false });
    }

    const body =
      name === 'arrival that already passed'
        ? { ...input, estimatedArrivalAt: '2000-01-01T12:00:00.000Z' }
        : input;
    const attempt = service.assign(actor, rentalId, body);

    await expect(attempt).rejects.toThrow(text);
    await expect(attempt).rejects.toBeInstanceOf(
      name.startsWith('rental of') ? NotFoundException : ConflictException,
    );
    expect(fleet.availability).not.toHaveBeenCalled();
    expect(outbox.flush).not.toHaveBeenCalled();
  });

  it('answers with the reason that flota gives and writes nothing', async () => {
    const { tx, fleet, outbox, service } = setup();
    fleet.availability.mockResolvedValue({
      bus: { available: false, reason: 'IN_WORKSHOP' },
      driver: { available: true },
    });

    await expect(service.assign(actor, rentalId, input)).rejects.toThrow(
      new ConflictException('Ese bus está en taller.'),
    );
    expect(tx.trip.create).not.toHaveBeenCalled();
    expect(outbox.add).not.toHaveBeenCalled();
  });

  it('keeps the rental pending when the bus is busy, as the database says', async () => {
    const { prisma, tx, outbox, service } = setup();
    prisma.$transaction.mockRejectedValueOnce(new Error('violates "trips_bus_no_overlap"'));

    await expect(service.assign(actor, rentalId, input)).rejects.toThrow(
      new ConflictException('Ese bus ya tiene un viaje en ese horario.'),
    );
    expect(tx.rentalRequest.update).not.toHaveBeenCalled();
    expect(outbox.flush).not.toHaveBeenCalled();
  });

  it('refuses a rental that another admin assigned while this one was asking flota', async () => {
    const { tx, outbox, service } = setup();
    tx.rentalRequest.findUnique.mockResolvedValue({ ...requestRow, status: 'ASSIGNED' });

    await expect(service.assign(actor, rentalId, input)).rejects.toThrow(
      new ConflictException('Ese alquiler ya tiene bus y chofer.'),
    );
    expect(tx.trip.create).not.toHaveBeenCalled();
    expect(outbox.add).not.toHaveBeenCalled();
  });

  it('refuses a session without a branch', async () => {
    const { service } = setup();

    await expect(service.assign({ ...actor, branchId: null }, rentalId, input)).rejects.toThrow();
  });
});
