import { ticketPageSchema } from '@debus/contracts';
import { Prisma } from '../generated/prisma/client';
import { TicketsService } from './tickets.service';

const clientId = '2a1b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const tripId = '5b4a3f2e-1d0c-4b9a-8f7e-6d5c4b3a2f1e';
const soldTicket = (id: string, status: 'PENDING' | 'CONFIRMED' = 'CONFIRMED') => ({
  id,
  tripId,
  status,
  channel: 'ONLINE',
  clientId,
  nit: 'CF',
  buyerName: 'Ana Méndez',
  email: 'ana@debus.test',
  unitPrice: new Prisma.Decimal(85),
  total: new Prisma.Decimal(170),
  paidOn: new Date('2026-10-19T00:00:00.000Z'),
  createdAt: new Date('2026-10-19T16:30:00.000Z'),
  trip: {
    tripId,
    originLabel: 'Quetzaltenango',
    destinationLabel: 'Guatemala',
    departureAt: new Date('2026-10-25T11:30:00.000Z'),
    busPlate: 'C482BTX',
  },
  seats: [{ seatNumber: 9 }, { seatNumber: 10 }],
});
const first = '9f8e7d6c-5b4a-4f3e-8d2c-1b0a9f8e7d6c';
const second = '8e7d6c5b-4a3f-4e2d-9c1b-0a9f8e7d6c5b';

function setup() {
  const prisma = {
    ticket: {
      findMany: jest.fn().mockResolvedValue([soldTicket(first), soldTicket(second, 'PENDING')]),
      count: jest.fn().mockResolvedValue(22),
      findFirst: jest.fn().mockResolvedValue(soldTicket(second, 'PENDING')),
    },
  };
  return { prisma, service: new TicketsService(prisma as never) };
}

describe('TicketsService', () => {
  it('pages the tickets of the client, newest sale first, with the next trip', async () => {
    const { prisma, service } = setup();

    const page = await service.history(clientId, { page: 2, pageSize: 20 });

    expect(ticketPageSchema.parse(page)).toEqual(page);
    expect(page).toMatchObject({ total: 22, page: 2, pageSize: 20 });
    expect(page.items.map((ticket) => [ticket.id, ticket.status, ticket.seats])).toEqual([
      [first, 'CONFIRMED', [9, 10]],
      [second, 'PENDING', [9, 10]],
    ]);
    expect(page.summary.next).toMatchObject({
      id: second,
      departureAt: '2026-10-25T11:30:00.000Z',
    });
    const [args] = prisma.ticket.findMany.mock.calls[0];
    expect(args).toMatchObject({
      where: { clientId },
      // The id breaks ties, so a ticket never shows up on two pages or on none.
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: 20,
      take: 20,
    });
    expect(prisma.ticket.count).toHaveBeenCalledWith({ where: args.where });
    expect(prisma.ticket.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { clientId, trip: { departureAt: { gt: expect.any(Date) } } },
        orderBy: [{ trip: { departureAt: 'asc' } }, { id: 'asc' }],
      }),
    );
  });

  it('has no next trip when every trip of the client already left', async () => {
    const { prisma, service } = setup();
    prisma.ticket.findFirst.mockResolvedValue(null);

    const page = await service.history(clientId, { page: 1, pageSize: 20 });

    expect(page.summary.next).toBeNull();
  });
});
