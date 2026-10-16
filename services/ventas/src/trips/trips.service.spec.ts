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

function setup() {
  const prisma = {
    trip: {
      findMany: jest.fn().mockResolvedValue([{ ...tripRow(), _count: { seats: 3 } }]),
      count: jest.fn().mockResolvedValue(41),
      findUnique: jest.fn(),
    },
  };
  return { prisma, service: new TripsService(prisma as never) };
}

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
    const [args] = prisma.trip.findMany.mock.calls[0];
    expect(args).toMatchObject({
      where: { departureAt: { gt: expect.any(Date) }, searchText: { contains: 'xela' } },
      orderBy: [{ departureAt: 'asc' }, { tripId: 'asc' }],
      include: { _count: { select: { seats: true } } },
      skip: 40,
      take: 20,
    });
    expect(prisma.trip.count).toHaveBeenCalledWith({ where: args.where });
  });

  it('answers the seat map with the taken seats in order', async () => {
    const { prisma, service } = setup();
    prisma.trip.findUnique.mockResolvedValue({
      ...tripRow(),
      seats: [{ seatNumber: 2 }, { seatNumber: 9 }],
    });

    await expect(service.seatMap(tripId)).resolves.toEqual({
      tripId,
      capacity: 40,
      ticketPrice: 85.5,
      departureAt: '2026-10-20T11:30:00.000Z',
      taken: [2, 9],
    });
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
