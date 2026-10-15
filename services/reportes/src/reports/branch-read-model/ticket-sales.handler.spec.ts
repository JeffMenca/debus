import { createEnvelope, exampleCounterTicketSold, exampleTicketSold } from '@debus/contracts';
import { TicketSalesHandler } from './ticket-sales.handler';

const setup = () => {
  const tx = { $executeRawUnsafe: jest.fn().mockResolvedValue(1), $queryRawUnsafe: jest.fn() };
  const prisma = { $executeRawUnsafe: jest.fn().mockResolvedValue(1) };
  return { tx, prisma, handler: new TicketSalesHandler(prisma as never) };
};
const envelope = createEnvelope('TicketSold', {}, 'c');

describe('TicketSalesHandler', () => {
  it('keeps an online sale with the number of seats and its paid day', async () => {
    const { tx, handler } = setup();
    const sale = exampleTicketSold;

    await handler.sold(sale, envelope, tx);

    const [sql, ...values] = tx.$executeRawUnsafe.mock.calls[0] ?? [];
    expect(sql).toContain('INSERT INTO branch_report_ticket_sales');
    expect(sql).toContain('ON CONFLICT (id) DO NOTHING');
    expect(values).toEqual([
      sale.ticketId,
      sale.tripId,
      sale.routeId,
      sale.branchId,
      sale.busId,
      sale.originLabel,
      sale.destinationLabel,
      sale.departureAt,
      'ONLINE',
      2,
      170,
      sale.paidOn,
      sale.soldAt,
    ]);
  });

  it('keeps a counter sale of one seat', async () => {
    const { tx, handler } = setup();

    await handler.sold(exampleCounterTicketSold, envelope, tx);

    const values = tx.$executeRawUnsafe.mock.calls[0]?.slice(1);
    expect(values?.slice(8, 11)).toEqual(['COUNTER', 1, 85]);
  });

  it('rejects a sale whose total is not the price times the seats', async () => {
    const { tx, handler } = setup();

    await expect(handler.sold({ ...exampleTicketSold, total: 1 }, envelope, tx)).rejects.toThrow();
    expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('falls back to the service client outside the inbox transaction', async () => {
    const { prisma, handler } = setup();

    await handler.sold(exampleTicketSold, envelope);

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(1);
  });
});
