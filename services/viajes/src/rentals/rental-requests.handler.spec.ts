import { createEnvelope, exampleRentalPaid } from '@debus/contracts';
import { RentalRequestsHandler } from './rental-requests.handler';

const setup = () => {
  const tx = { $executeRawUnsafe: jest.fn().mockResolvedValue(1) };
  const prisma = { $executeRawUnsafe: jest.fn().mockResolvedValue(1) };
  return { tx, prisma, handler: new RentalRequestsHandler(prisma as never) };
};
const envelope = createEnvelope('RentalPaid', exampleRentalPaid, 'c');

describe('RentalRequestsHandler', () => {
  it('keeps a paid rental as a pending request, once even if the event comes again', async () => {
    const { tx, handler } = setup();

    await handler.paid(exampleRentalPaid, envelope, tx as never);

    const [sql, ...values] = tx.$executeRawUnsafe.mock.calls[0] as [string, ...unknown[]];
    expect(sql).toContain('INSERT INTO rental_requests');
    expect(sql).toContain('ON CONFLICT (id) DO NOTHING');
    expect(values).toEqual([
      exampleRentalPaid.rentalId,
      exampleRentalPaid.branchId,
      'Colegio San José',
      '1234567-8',
      'Quetzaltenango',
      'Panajachel',
      exampleRentalPaid.departureAt,
      exampleRentalPaid.returnAt,
      35,
      92,
      2760,
    ]);
  });

  it('keeps a one-way rental with no return', async () => {
    const { tx, handler } = setup();

    await handler.paid({ ...exampleRentalPaid, returnAt: null }, envelope, tx as never);

    expect(tx.$executeRawUnsafe.mock.calls[0]?.[8]).toBeNull();
  });

  it('rejects a malformed payload without writing', async () => {
    const { tx, handler } = setup();

    await expect(handler.paid({ rentalId: 'x' }, envelope, tx as never)).rejects.toThrow();
    expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('falls back to the service client outside the inbox transaction', async () => {
    const { prisma, handler } = setup();

    await handler.paid(exampleRentalPaid, envelope);

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(1);
  });
});
