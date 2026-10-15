import { createEnvelope, exampleRentalPaid } from '@debus/contracts';
import { RentalsHandler } from './rentals.handler';

const setup = () => {
  const tx = { $executeRawUnsafe: jest.fn().mockResolvedValue(1), $queryRawUnsafe: jest.fn() };
  const prisma = { $executeRawUnsafe: jest.fn().mockResolvedValue(1) };
  return { tx, prisma, handler: new RentalsHandler(prisma as never) };
};
const envelope = createEnvelope('RentalPaid', {}, 'c');

describe('RentalsHandler', () => {
  it('keeps a paid rental once with the branch that confirmed it', async () => {
    const { tx, handler } = setup();
    const rental = exampleRentalPaid;

    await handler.paid(rental, envelope, tx);

    const [sql, ...values] = tx.$executeRawUnsafe.mock.calls[0] ?? [];
    expect(sql).toContain('INSERT INTO branch_report_rentals');
    expect(sql).toContain('ON CONFLICT (id) DO NOTHING');
    expect(values).toEqual([
      rental.rentalId,
      rental.branchId,
      rental.clientId,
      rental.nit,
      rental.clientName,
      rental.originLabel,
      rental.destinationLabel,
      rental.departureAt,
      rental.returnAt,
      rental.passengers,
      rental.distanceKm,
      rental.price,
      rental.paidOn,
    ]);
  });

  it('keeps a rental without a return', async () => {
    const { tx, handler } = setup();

    await handler.paid({ ...exampleRentalPaid, returnAt: null }, envelope, tx);

    expect(tx.$executeRawUnsafe.mock.calls[0]?.[9]).toBeNull();
  });

  it('rejects a rental that returns before it leaves', async () => {
    const { tx, handler } = setup();

    await expect(
      handler.paid({ ...exampleRentalPaid, returnAt: '2026-10-24T12:00:00.000Z' }, envelope, tx),
    ).rejects.toThrow();
    expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('falls back to the service client outside the inbox transaction', async () => {
    const { prisma, handler } = setup();

    await handler.paid(exampleRentalPaid, envelope);

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(1);
  });
});
