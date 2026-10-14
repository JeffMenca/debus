import {
  tripCompletedPayloadSchema,
  tripDeletedPayloadSchema,
  tripDepartedPayloadSchema,
} from '@debus/contracts';
import { REQUEST_FLUSH } from '@debus/messaging';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { TripCycleService } from './trip-cycle.service';

const branchId = '9b2c7a10-1111-4c4c-8888-123456789abc';
const busId = '1f0e2d3c-4b5a-4968-8776-655443322110';
const driverId = '2a1b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const rentalId = '5d1f3a20-2222-4d4d-9999-123456789abc';
const admin = {
  userId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  role: 'BRANCH_ADMIN' as const,
  branchId,
};
const driverActor = { userId: driverId, role: 'DRIVER' as const, branchId };
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

const tripRow = {
  id: 'f4c3b2a1-0000-4000-8000-000000000000',
  type: 'REGULAR' as const,
  status: 'SCHEDULED' as const,
  branchId,
  routeId: '3b2c1d0e-6f5a-4b4c-9d8e-7f6a5b4c3d2e',
  busId,
  busPlate: 'C482BTX',
  capacity: 40,
  driverId,
  driverName: 'Julio Pérez',
  originLabel: 'Quetzaltenango',
  destinationLabel: 'Guatemala',
  departureAt: new Date('2026-10-05T10:00:00.000Z'),
  estimatedArrivalAt: new Date('2026-10-05T14:00:00.000Z'),
  ticketPrice: new Prisma.Decimal('85.00'),
  rentalId: null,
  createdById: admin.userId,
  searchText: '',
  createdAt: new Date(),
  updatedAt: new Date(),
};
const departureRow = {
  tripId: tripRow.id,
  departedAt: new Date('2026-10-05T10:05:00.000Z'),
  startMileageKm: 1000,
  recordedById: admin.userId,
  recordedByRole: 'BRANCH_ADMIN' as const,
  createdAt: new Date(),
};
const rate = { versionId: '0a0b0c0d-1111-4222-8333-444455556666', depreciationPerKm: 0.85 };

const setup = () => {
  // Another trip of the bus or of the driver that is on the road; none unless a test sets one.
  const elsewhere: { bus: object | null; driver: object | null } = { bus: null, driver: null };
  const tx = {
    $queryRawUnsafe: jest.fn().mockResolvedValue([]),
    $executeRawUnsafe: jest.fn().mockResolvedValue(0),
    trip: {
      findFirst: jest.fn(async ({ where }) => {
        if (where.status !== 'IN_TRANSIT') return tripRow;
        return where.busId ? elsewhere.bus : elsewhere.driver;
      }),
      update: jest.fn().mockResolvedValue(tripRow),
      delete: jest.fn().mockResolvedValue(tripRow),
    },
    busCopy: {
      findUnique: jest.fn().mockResolvedValue({ active: true, mileageKm: 1000 }),
    },
    driverCopy: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ active: true, baseSalary: new Prisma.Decimal('250.00') }),
    },
    tripDeparture: {
      create: jest
        .fn()
        .mockImplementation(({ data }) => Promise.resolve({ ...departureRow, ...data })),
      findUnique: jest.fn().mockResolvedValue(departureRow),
    },
    tripArrival: {
      aggregate: jest.fn().mockResolvedValue({ _max: { endMileageKm: null } }),
      create: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          ...data,
          fuelCost: new Prisma.Decimal(data.fuelCost),
          depreciationPerKm: new Prisma.Decimal(data.depreciationPerKm),
          depreciationAmount: new Prisma.Decimal(data.depreciationAmount),
          driverPay: new Prisma.Decimal(data.driverPay),
        }),
      ),
    },
    rentalRequest: { update: jest.fn().mockResolvedValue({}) },
  };
  const prisma = { $transaction: jest.fn((work) => work(tx)) };
  const outbox = {
    add: jest.fn().mockResolvedValue({}),
    flush: jest.fn().mockResolvedValue({}),
  };
  const settings = { effectiveOn: jest.fn().mockResolvedValue(rate) };
  const trips = { loadDetail: jest.fn().mockResolvedValue({ id: tripRow.id }) };
  return {
    tx,
    elsewhere,
    prisma,
    outbox,
    settings,
    trips,
    service: new TripCycleService(
      prisma as never,
      outbox as never,
      settings as never,
      trips as never,
    ),
  };
};

describe('TripCycleService.recordDeparture', () => {
  const input = () => ({ departedAt: minutesAgo(5), startMileageKm: 1000 });

  it('writes the departure, puts the trip on the road and queues TripDeparted, then flushes', async () => {
    const { tx, outbox, trips, service } = setup();

    const detail = await service.recordDeparture(admin, tripRow.id, input(), 'c');

    expect(tx.$queryRawUnsafe).toHaveBeenCalledWith(
      'SELECT id FROM trips WHERE id = $1::uuid FOR UPDATE',
      tripRow.id,
    );
    expect(tx.tripDeparture.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tripId: tripRow.id,
        startMileageKm: 1000,
        recordedById: admin.userId,
        recordedByRole: 'BRANCH_ADMIN',
      }),
    });
    expect(tx.trip.update).toHaveBeenCalledWith({
      where: { id: tripRow.id },
      data: { status: 'IN_TRANSIT' },
    });
    expect(outbox.add).toHaveBeenCalledWith(
      tx,
      'TripDeparted',
      expect.objectContaining({ tripId: tripRow.id, busId, startMileageKm: 1000 }),
      'c',
    );
    const payload = outbox.add.mock.calls[0]?.[2];
    expect(tripDepartedPayloadSchema.parse(payload)).toEqual(payload);
    expect(outbox.flush).toHaveBeenCalledWith(REQUEST_FLUSH);
    expect(trips.loadDetail).toHaveBeenCalledWith({ id: tripRow.id, branchId });
    expect(detail).toEqual({ id: tripRow.id });
  });

  it('queues for the bus and the driver after locking the trip', async () => {
    const { tx, service } = setup();

    await service.recordDeparture(admin, tripRow.id, input());

    expect(tx.$queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('FOR UPDATE'),
      tripRow.id,
    );
    expect(tx.$executeRawUnsafe.mock.calls.map(([, key]) => key)).toEqual([
      `trip-bus:${busId}`,
      `trip-driver:${driverId}`,
    ]);
    const [lockRow] = tx.$queryRawUnsafe.mock.invocationCallOrder as [number];
    const [queueBus, queueDriver] = tx.$executeRawUnsafe.mock.invocationCallOrder as [
      number,
      number,
    ];
    expect(lockRow).toBeLessThan(queueBus);
    expect(queueBus).toBeLessThan(queueDriver);
    expect(queueDriver).toBeLessThan(tx.tripDeparture.create.mock.invocationCallOrder[0] ?? 0);
  });

  it('looks for another trip on the road of the same bus and of the same driver', async () => {
    const { tx, service } = setup();

    await service.recordDeparture(admin, tripRow.id, input());

    const notThisTrip = { status: 'IN_TRANSIT', id: { not: tripRow.id } };
    expect(tx.trip.findFirst).toHaveBeenCalledWith({
      where: { busId, ...notThisTrip },
      select: { id: true },
    });
    expect(tx.trip.findFirst).toHaveBeenCalledWith({
      where: { driverId, ...notThisTrip },
      select: { id: true },
    });
  });

  it.each([
    ['bus', 'Ese bus sigue en otro viaje. Registra primero la llegada de ese viaje.'],
    ['driver', 'Ese chofer sigue en otro viaje. Registra primero la llegada de ese viaje.'],
  ] as const)(
    'refuses the departure while the %s is on another trip, and writes nothing',
    async (who, text) => {
      const { tx, elsewhere, outbox, service } = setup();
      elsewhere[who] = { id: 'other-trip' };

      const attempt = service.recordDeparture(admin, tripRow.id, input());

      await expect(attempt).rejects.toThrow(new ConflictException(text));
      expect(tx.tripDeparture.create).not.toHaveBeenCalled();
      expect(tx.trip.update).not.toHaveBeenCalled();
      expect(outbox.add).not.toHaveBeenCalled();
      expect(outbox.flush).not.toHaveBeenCalled();
    },
  );

  it('takes the last arrival of the bus as its mileage when the copy lags behind', async () => {
    const { tx, outbox, service } = setup();
    tx.tripArrival.aggregate.mockResolvedValue({ _max: { endMileageKm: 1204 } });

    const attempt = service.recordDeparture(admin, tripRow.id, {
      ...input(),
      startMileageKm: 1100,
    });

    await expect(attempt).rejects.toThrow(
      new ConflictException(
        'El kilometraje inicial no puede ser menor que el último registrado del bus.',
      ),
    );
    expect(tx.tripArrival.aggregate).toHaveBeenCalledWith({
      _max: { endMileageKm: true },
      where: { trip: { busId } },
    });
    expect(outbox.add).not.toHaveBeenCalled();
  });

  it('lets the bus leave from exactly its last arrival', async () => {
    const { tx, service } = setup();
    tx.tripArrival.aggregate.mockResolvedValue({ _max: { endMileageKm: 1204 } });

    await service.recordDeparture(admin, tripRow.id, { ...input(), startMileageKm: 1204 });

    expect(tx.tripDeparture.create).toHaveBeenCalled();
  });

  it('refuses a departure registered long before the scheduled time', async () => {
    const { tx, outbox, service } = setup();
    tx.trip.findFirst.mockResolvedValueOnce({
      ...tripRow,
      departureAt: new Date(Date.now() + 3 * 24 * 3_600_000),
    });

    await expect(service.recordDeparture(admin, tripRow.id, input())).rejects.toThrow(
      /12 horas de anticipación/,
    );
    expect(tx.tripDeparture.create).not.toHaveBeenCalled();
    expect(outbox.add).not.toHaveBeenCalled();
  });

  it('records who registered it: a driver is a driver', async () => {
    const { tx, service } = setup();

    await service.recordDeparture(driverActor, tripRow.id, input());

    expect(tx.tripDeparture.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ recordedByRole: 'DRIVER', recordedById: driverId }),
    });
    expect(tx.trip.findFirst).toHaveBeenCalledWith({ where: { id: tripRow.id, driverId } });
  });

  it.each([
    ['alreadyDeparted', 'La salida de este viaje ya fue registrada.'],
    ['departureBusInactive', 'Elimina el viaje'],
    ['departureDriverInactive', 'Elimina el viaje'],
    ['startMileageBelowBus', 'kilometraje inicial'],
    ['departureInFuture', 'en el futuro'],
  ])('refuses with %s and writes nothing', async (problem, text) => {
    const { tx, outbox, service } = setup();
    if (problem === 'alreadyDeparted') {
      tx.trip.findFirst.mockResolvedValue({ ...tripRow, status: 'IN_TRANSIT' });
    }
    if (problem === 'departureBusInactive') {
      tx.busCopy.findUnique.mockResolvedValue({ active: false, mileageKm: 1000 });
    }
    if (problem === 'departureDriverInactive') {
      tx.driverCopy.findUnique.mockResolvedValue({ active: false, baseSalary: 250 });
    }
    const body =
      problem === 'startMileageBelowBus'
        ? { ...input(), startMileageKm: 999 }
        : problem === 'departureInFuture'
          ? { ...input(), departedAt: new Date(Date.now() + 3_600_000).toISOString() }
          : input();

    const attempt = service.recordDeparture(admin, tripRow.id, body);

    await expect(attempt).rejects.toThrow(ConflictException);
    await expect(attempt).rejects.toThrow(text);
    expect(tx.tripDeparture.create).not.toHaveBeenCalled();
    expect(outbox.add).not.toHaveBeenCalled();
    expect(outbox.flush).not.toHaveBeenCalled();
  });

  it('answers that it already left when two registrations race to the same row', async () => {
    const { tx, outbox, service } = setup();
    tx.tripDeparture.create.mockRejectedValue({ code: 'P2002' });

    await expect(service.recordDeparture(admin, tripRow.id, input())).rejects.toThrow(
      new ConflictException('La salida de este viaje ya fue registrada.'),
    );
    expect(outbox.flush).not.toHaveBeenCalled();
  });

  it('lets any other database failure through', async () => {
    const { tx, service } = setup();
    tx.tripDeparture.create.mockRejectedValue(new Error('boom'));

    await expect(service.recordDeparture(admin, tripRow.id, input())).rejects.toThrow('boom');
  });

  it('answers not found for a trip the caller may not see, such as one of another driver', async () => {
    const { tx, service } = setup();
    tx.trip.findFirst.mockResolvedValue(null);

    await expect(service.recordDeparture(driverActor, tripRow.id, input())).rejects.toThrow(
      new NotFoundException('No encontramos ese viaje.'),
    );
  });
});

describe('TripCycleService.recordArrival', () => {
  const onTheRoad = { ...tripRow, status: 'IN_TRANSIT' as const };
  const input = () => ({
    arrivedAt: '2026-10-05T14:10:00.000Z',
    endMileageKm: 1204,
    fuelCost: 1180,
  });

  it.each([
    ['2026-10-05T23:30:00.000Z', '2026-10-05'],
    ['2026-10-06T03:00:00.000Z', '2026-10-05'],
    ['2026-10-06T06:00:00.000Z', '2026-10-06'],
  ])('asks for the depreciation of the Guatemalan day of %s', async (arrivedAt, day) => {
    const { tx, settings, service } = setup();
    tx.trip.findFirst.mockResolvedValue(onTheRoad);

    await service.recordArrival(admin, tripRow.id, { ...input(), arrivedAt });

    expect(settings.effectiveOn).toHaveBeenCalledWith(day);
  });

  it('fixes the amounts, completes the trip and queues TripCompleted, then flushes', async () => {
    const { tx, outbox, trips, service } = setup();
    tx.trip.findFirst.mockResolvedValue(onTheRoad);

    await service.recordArrival(driverActor, tripRow.id, input(), 'c');

    expect(tx.tripArrival.create).toHaveBeenCalledWith({
      data: {
        tripId: tripRow.id,
        arrivedAt: new Date(input().arrivedAt),
        endMileageKm: 1204,
        fuelCost: 1180,
        distanceKm: 204,
        depreciationPerKm: 0.85,
        depreciationAmount: 173.4,
        driverPay: 250,
        settingsVersionId: rate.versionId,
        recordedById: driverId,
        recordedByRole: 'DRIVER',
      },
    });
    expect(tx.trip.update).toHaveBeenCalledWith({
      where: { id: tripRow.id },
      data: { status: 'COMPLETED' },
    });
    expect(outbox.add).toHaveBeenCalledWith(
      tx,
      'TripCompleted',
      expect.objectContaining({
        tripId: tripRow.id,
        startMileageKm: 1000,
        endMileageKm: 1204,
        depreciationAmount: 173.4,
        driverPay: 250,
      }),
      'c',
    );
    const payload = outbox.add.mock.calls[0]?.[2];
    expect(tripCompletedPayloadSchema.parse(payload)).toEqual(payload);
    expect(outbox.flush).toHaveBeenCalledWith(REQUEST_FLUSH);
    expect(trips.loadDetail).toHaveBeenCalledWith({ id: tripRow.id, driverId });
  });

  it('pays a rental driver 15% more', async () => {
    const { tx, service } = setup();
    tx.trip.findFirst.mockResolvedValue({ ...onTheRoad, type: 'RENTAL' });

    await service.recordArrival(admin, tripRow.id, input());

    expect(tx.tripArrival.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ driverPay: 287.5 }),
    });
  });

  it('refuses without a depreciation amount in force and writes nothing', async () => {
    const { tx, outbox, settings, service } = setup();
    tx.trip.findFirst.mockResolvedValue(onTheRoad);
    settings.effectiveOn.mockResolvedValue(null);

    await expect(service.recordArrival(admin, tripRow.id, input())).rejects.toThrow(
      new ConflictException(
        'Aún no hay monto de depreciación vigente para ese día. Pide al admin del sistema que lo configure.',
      ),
    );
    expect(tx.tripArrival.create).not.toHaveBeenCalled();
    expect(outbox.add).not.toHaveBeenCalled();
  });

  it('answers not found, not a missing amount, for a trip that is not there', async () => {
    const { tx, settings, service } = setup();
    tx.trip.findFirst.mockResolvedValue(null);
    settings.effectiveOn.mockResolvedValue(null);

    await expect(service.recordArrival(admin, tripRow.id, input())).rejects.toThrow(
      NotFoundException,
    );
  });

  it('answers that the trip has not left, not a missing amount, for a scheduled one', async () => {
    const { settings, service } = setup();
    settings.effectiveOn.mockResolvedValue(null);

    await expect(service.recordArrival(admin, tripRow.id, input())).rejects.toThrow(
      'Primero registra la salida',
    );
  });

  it('refuses to fix the driver pay at zero when the salary of the driver is unknown', async () => {
    const { tx, outbox, service } = setup();
    tx.trip.findFirst.mockResolvedValue(onTheRoad);
    tx.driverCopy.findUnique.mockResolvedValue(null);

    await expect(service.recordArrival(admin, tripRow.id, input())).rejects.toThrow(
      new ConflictException(
        'Aún no tenemos el salario de ese chofer. Intenta de nuevo en unos segundos.',
      ),
    );
    expect(tx.tripArrival.create).not.toHaveBeenCalled();
    expect(outbox.add).not.toHaveBeenCalled();
  });

  it('refuses a distance no trip could cover, a typing mistake of one digit', async () => {
    const { tx, outbox, service } = setup();
    tx.trip.findFirst.mockResolvedValue(onTheRoad);

    await expect(
      service.recordArrival(admin, tripRow.id, { ...input(), endMileageKm: 11_000 }),
    ).rejects.toThrow(/demasiado alto para un solo viaje/);
    expect(tx.tripArrival.create).not.toHaveBeenCalled();
    expect(outbox.add).not.toHaveBeenCalled();
  });

  it('refuses a depreciation the TripCompleted contract could not carry', async () => {
    const { tx, outbox, settings, service } = setup();
    tx.trip.findFirst.mockResolvedValue(onTheRoad);
    settings.effectiveOn.mockResolvedValue({ ...rate, depreciationPerKm: 100_000 });

    await expect(service.recordArrival(admin, tripRow.id, input())).rejects.toThrow(
      /depreciación de este viaje sale demasiado alta/,
    );
    expect(tx.tripArrival.create).not.toHaveBeenCalled();
    expect(outbox.add).not.toHaveBeenCalled();
  });

  it.each([
    ['notOnTheRoad', 'Primero registra la salida'],
    ['alreadyArrived', 'La llegada de este viaje ya fue registrada.'],
    ['arrivalBeforeDeparture', 'después de la salida'],
    ['endMileageBelowStart', 'kilometraje final'],
    ['noDepartureRecord', 'Primero registra la salida'],
  ])('refuses with %s and writes nothing', async (problem, text) => {
    const { tx, outbox, service } = setup();
    tx.trip.findFirst.mockResolvedValue({
      ...onTheRoad,
      status:
        problem === 'notOnTheRoad'
          ? 'SCHEDULED'
          : problem === 'alreadyArrived'
            ? 'COMPLETED'
            : 'IN_TRANSIT',
    });
    if (problem === 'noDepartureRecord') tx.tripDeparture.findUnique.mockResolvedValue(null);
    const body =
      problem === 'arrivalBeforeDeparture'
        ? { ...input(), arrivedAt: '2026-10-05T10:05:00.000Z' }
        : problem === 'endMileageBelowStart'
          ? { ...input(), endMileageKm: 999 }
          : input();

    const attempt = service.recordArrival(admin, tripRow.id, body);

    await expect(attempt).rejects.toThrow(ConflictException);
    await expect(attempt).rejects.toThrow(text);
    expect(tx.tripArrival.create).not.toHaveBeenCalled();
    expect(outbox.add).not.toHaveBeenCalled();
  });

  it('answers that it already arrived when two registrations race, and lets other failures through', async () => {
    const { tx, service } = setup();
    tx.trip.findFirst.mockResolvedValue(onTheRoad);
    tx.tripArrival.create.mockRejectedValueOnce({ code: 'P2002' });

    await expect(service.recordArrival(admin, tripRow.id, input())).rejects.toThrow(
      new ConflictException('La llegada de este viaje ya fue registrada.'),
    );
    tx.tripArrival.create.mockRejectedValueOnce(new Error('boom'));
    await expect(service.recordArrival(admin, tripRow.id, input())).rejects.toThrow('boom');
  });

  it('answers not found for a trip of another driver', async () => {
    const { tx, service } = setup();
    tx.trip.findFirst.mockResolvedValue(null);

    await expect(service.recordArrival(driverActor, tripRow.id, input())).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('TripCycleService.remove', () => {
  it('deletes a trip that has not left and queues TripDeleted, then flushes', async () => {
    const { tx, outbox, service } = setup();

    await service.remove(admin, tripRow.id, 'c');

    expect(tx.trip.delete).toHaveBeenCalledWith({ where: { id: tripRow.id } });
    expect(tx.rentalRequest.update).not.toHaveBeenCalled();
    expect(outbox.add).toHaveBeenCalledWith(
      tx,
      'TripDeleted',
      expect.objectContaining({ tripId: tripRow.id, busId, driverId }),
      'c',
    );
    const payload = outbox.add.mock.calls[0]?.[2];
    expect(tripDeletedPayloadSchema.parse(payload)).toEqual(payload);
    expect(outbox.flush).toHaveBeenCalledWith(REQUEST_FLUSH);
  });

  it('refuses a trip that left or arrived, and deletes nothing', async () => {
    const { tx, outbox, service } = setup();

    for (const status of ['IN_TRANSIT', 'COMPLETED'] as const) {
      tx.trip.findFirst.mockResolvedValue({ ...tripRow, status });
      await expect(service.remove(admin, tripRow.id)).rejects.toThrow(
        new ConflictException('Este viaje ya salió. Solo se eliminan viajes que no han salido.'),
      );
    }
    expect(tx.trip.delete).not.toHaveBeenCalled();
    expect(outbox.add).not.toHaveBeenCalled();
  });

  it('sends the paid rental back to be assigned again', async () => {
    const { tx, service } = setup();
    tx.trip.findFirst.mockResolvedValue({ ...tripRow, type: 'RENTAL', routeId: null, rentalId });

    await service.remove(admin, tripRow.id);

    expect(tx.rentalRequest.update).toHaveBeenCalledWith({
      where: { id: rentalId },
      data: { status: 'PENDING', tripId: null },
    });
  });

  it('answers not found for a trip of another branch', async () => {
    const { tx, service } = setup();
    tx.trip.findFirst.mockResolvedValue(null);

    await expect(service.remove(admin, tripRow.id)).rejects.toThrow(NotFoundException);
  });
});
