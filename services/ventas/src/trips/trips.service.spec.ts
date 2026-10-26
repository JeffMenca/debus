import { seatMapSchema } from '@debus/contracts';
import { NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { TripsService } from './trips.service';

const tripId = '5b4a3f2e-1d0c-4b9a-8f7e-6d5c4b3a2f1e';
const departureAt = new Date('2026-10-20T11:30:00.000Z');
const tripRow = (over: Record<string, unknown> = {}) => ({
  tripId,
  branchId: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  routeId: '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e',
  busId: '3c4d5e6f-7a8b-4c9d-8e1f-2a3b4c5d6e7f',
  busPlate: 'C482BTX',
  originLabel: 'Quetzaltenango',
  destinationLabel: 'Guatemala',
  capacity: 40,
  ticketPrice: new Prisma.Decimal(85.5),
  departureAt,
  estimatedArrivalAt: new Date('2026-10-20T15:45:00.000Z'),
  searchText: 'quetzaltenango guatemala c482btx',
  createdAt: departureAt,
  ...over,
});

// What the list query answers: the trip with its free seats already counted.
const listedRow = () => ({
  tripId,
  routeId: tripRow().routeId,
  branchId: tripRow().branchId,
  originLabel: 'Quetzaltenango',
  destinationLabel: 'Guatemala',
  departureAt,
  estimatedArrivalAt: tripRow().estimatedArrivalAt,
  ticketPrice: new Prisma.Decimal(85.5),
  busPlate: 'C482BTX',
  capacity: 40,
  freeSeats: 37,
});

function setup() {
  const prisma = {
    $queryRaw: jest
      .fn()
      .mockResolvedValueOnce([listedRow()])
      .mockResolvedValueOnce([{ total: 41 }]),
    trip: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
  };
  return { prisma, service: new TripsService(prisma as never) };
}

const sqlOf = (call: unknown[]) => call[0] as Prisma.Sql;

describe('TripsService', () => {
  it('lists the trips on sale with their free seats, in a stable order', async () => {
    const { prisma, service } = setup();

    const page = await service.list({ page: 3, pageSize: 20, q: 'xela' });

    expect(page).toEqual({
      items: [
        {
          tripId,
          routeId: tripRow().routeId,
          branchId: tripRow().branchId,
          originLabel: 'Quetzaltenango',
          destinationLabel: 'Guatemala',
          departureAt: '2026-10-20T11:30:00.000Z',
          estimatedArrivalAt: '2026-10-20T15:45:00.000Z',
          ticketPrice: 85.5,
          busPlate: 'C482BTX',
          capacity: 40,
          freeSeats: 37,
        },
      ],
      total: 41,
      page: 3,
      pageSize: 20,
    });
    const list = sqlOf(prisma.$queryRaw.mock.calls[0]);
    const count = sqlOf(prisma.$queryRaw.mock.calls[1]);
    expect(list.sql).toContain('t.capacity - COALESCE(s.taken, 0) AS "freeSeats"');
    // The id breaks ties, so a trip never shows up on two pages or on none.
    expect(list.sql).toContain('ORDER BY t.departure_at, t.trip_id LIMIT ? OFFSET ?');
    expect(list.values).toEqual([expect.any(Date), '%xela%', 20, 40]);
    expect(count.sql).toContain('SELECT count(*)::int AS total');
    expect(count.values).toEqual([expect.any(Date), '%xela%']);
  });

  it('lists only the trips of one branch when asked for its counter', async () => {
    const { prisma, service } = setup();

    await service.list({ page: 1, pageSize: 20 }, tripRow().branchId);

    expect(sqlOf(prisma.$queryRaw.mock.calls[0]).values).toContain(tripRow().branchId);
  });

  it('answers no trips and a zero total when nothing matches', async () => {
    const { prisma, service } = setup();
    prisma.$queryRaw
      .mockReset()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0 }]);

    await expect(service.list({ page: 1, pageSize: 20, seats: 4 })).resolves.toEqual({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
    });
  });

  it('lists the places of the trips still on sale, each once and in order', async () => {
    const { prisma, service } = setup();
    prisma.trip.findMany
      .mockResolvedValueOnce([{ originLabel: 'Cobán' }, { originLabel: 'Quetzaltenango' }])
      .mockResolvedValueOnce([{ destinationLabel: 'Guatemala' }]);

    await expect(service.places()).resolves.toEqual({
      origins: ['Cobán', 'Quetzaltenango'],
      destinations: ['Guatemala'],
    });
    expect(prisma.trip.findMany).toHaveBeenCalledWith({
      where: { departureAt: { gt: expect.any(Date) } },
      distinct: ['originLabel'],
      select: { originLabel: true },
      orderBy: { originLabel: 'asc' },
    });
    expect(prisma.trip.findMany).toHaveBeenCalledWith({
      where: { departureAt: { gt: expect.any(Date) } },
      distinct: ['destinationLabel'],
      select: { destinationLabel: true },
      orderBy: { destinationLabel: 'asc' },
    });
  });

  it('answers the seat map with the taken seats in order', async () => {
    const { prisma, service } = setup();
    prisma.trip.findUnique.mockResolvedValue({
      ...tripRow(),
      seats: [{ seatNumber: 2 }, { seatNumber: 9 }],
    });

    const map = await service.seatMap(tripId);

    // The screen that sells the seats shows the trip with them.
    expect(map).toEqual({
      tripId,
      originLabel: 'Quetzaltenango',
      destinationLabel: 'Guatemala',
      busPlate: 'C482BTX',
      capacity: 40,
      ticketPrice: 85.5,
      departureAt: '2026-10-20T11:30:00.000Z',
      estimatedArrivalAt: '2026-10-20T15:45:00.000Z',
      taken: [2, 9],
    });
    expect(seatMapSchema.parse(map)).toEqual(map);
    expect(prisma.trip.findUnique).toHaveBeenCalledWith({
      where: { tripId },
      include: { seats: { select: { seatNumber: true }, orderBy: { seatNumber: 'asc' } } },
    });
  });

  it('answers 404 for a trip it does not know', async () => {
    const { prisma, service } = setup();
    prisma.trip.findUnique.mockResolvedValue(null);

    await expect(service.seatMap(tripId)).rejects.toBeInstanceOf(NotFoundException);
  });
});
