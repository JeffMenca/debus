import { createEnvelope, exampleTicketSold } from '@debus/contracts';
import { TicketsHandler } from './tickets.handler';

const ticket = { ...exampleTicketSold, email: 'ana@correo.com', buyerName: 'Ana Méndez' };
const tripDeleted = {
  tripId: ticket.tripId,
  type: 'REGULAR',
  branchId: ticket.branchId,
  busId: ticket.busId,
  driverId: '0f0e0d0c-0b0a-4908-8706-050403020100',
  departureAt: ticket.departureAt,
};
const copyRow = {
  ticketId: ticket.ticketId,
  tripId: ticket.tripId,
  email: 'ana@correo.com',
  buyerName: 'Ana Méndez',
  channel: 'ONLINE',
  originLabel: ticket.originLabel,
  destinationLabel: ticket.destinationLabel,
  departureAt: new Date(ticket.departureAt),
  seats: ticket.seats,
  total: ticket.total,
};

function setup() {
  const queue = { enqueue: jest.fn().mockResolvedValue(1) };
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    cancelledTrip: {
      findUnique: jest.fn().mockResolvedValue(null),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    ticketCopy: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const handler = new TicketsHandler(queue as never, {} as never);
  const queued = () => queue.enqueue.mock.calls.flatMap(([, emails]) => emails);
  return { queue, tx, handler, queued };
}

describe('TicketsHandler', () => {
  it('keeps a copy of a ticket with email and queues its confirmation', async () => {
    const { tx, handler, queued } = setup();
    const envelope = createEnvelope('TicketSold', ticket, 'c');

    await handler.sold(ticket, envelope, tx as never);

    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.ticketCopy.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ ticketId: ticket.ticketId, email: 'ana@correo.com' })],
      skipDuplicates: true,
    });
    expect(queued()).toEqual([
      expect.objectContaining({
        eventId: envelope.eventId,
        dedupeKey: `ticket-sold:${ticket.ticketId}`,
        template: 'TICKET_SOLD',
        message: expect.objectContaining({ to: 'ana@correo.com' }),
      }),
    ]);
  });

  it('does nothing for a counter ticket without email', async () => {
    const { tx, handler, queue } = setup();
    const counter = { ...ticket, channel: 'COUNTER', clientId: null, email: null };

    await handler.sold(counter, createEnvelope('TicketSold', counter, 'c'), tx as never);

    expect(tx.ticketCopy.createMany).not.toHaveBeenCalled();
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('sends the cancellation instead of the purchase when the trip is already deleted', async () => {
    const { tx, handler, queued } = setup();
    tx.cancelledTrip.findUnique.mockResolvedValue({ tripId: ticket.tripId });

    await handler.sold(ticket, createEnvelope('TicketSold', ticket, 'c'), tx as never);

    expect(tx.ticketCopy.createMany).not.toHaveBeenCalled();
    expect(queued()).toEqual([
      expect.objectContaining({
        dedupeKey: `trip-cancelled:${ticket.ticketId}`,
        template: 'TRIP_CANCELLED',
      }),
    ]);
  });

  it('marks the deleted trip, drops its copies and warns every buyer', async () => {
    const { tx, handler, queued } = setup();
    const counter = {
      ...copyRow,
      ticketId: '11111111-2222-4333-8444-555555555555',
      channel: 'COUNTER',
    };
    tx.ticketCopy.findMany.mockResolvedValue([copyRow, counter]);
    const envelope = createEnvelope('TripDeleted', tripDeleted, 'c');

    await handler.tripDeleted(tripDeleted, envelope, tx as never);

    expect(tx.cancelledTrip.createMany).toHaveBeenCalledWith({
      data: [{ tripId: ticket.tripId }],
      skipDuplicates: true,
    });
    expect(tx.ticketCopy.deleteMany).toHaveBeenCalledWith({ where: { tripId: ticket.tripId } });
    expect(queued().map((email: { dedupeKey: string }) => email.dedupeKey)).toEqual([
      `trip-cancelled:${copyRow.ticketId}`,
      `trip-cancelled:${counter.ticketId}`,
    ]);
    expect(queued()[1].message.text).toContain('ventanilla');
  });

  it('rejects an invalid payload without writing', async () => {
    const { tx, handler } = setup();

    await expect(
      handler.sold({ ticketId: 'x' }, createEnvelope('TicketSold', {}, 'c'), tx as never),
    ).rejects.toThrow();
    await expect(
      handler.tripDeleted({}, createEnvelope('TripDeleted', {}, 'c'), tx as never),
    ).rejects.toThrow();
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
});
