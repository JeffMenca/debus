import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { WalletService } from './wallet.service';

const clientId = '7d6c5b4a-3f2e-4d1c-8b0a-9f8e7d6c5b4a';
const key = '3f2e4d1c-8b0a-4f8e-9d6c-5b4a3f2e4d1c';
const ticketId = '8e7d6c5b-4a3f-4e2d-9c1b-0a9f8e7d6c5b';
const updatedAt = new Date('2026-10-14T16:00:00.000Z');
const wallet = (balance: number) => ({ clientId, balance: new Prisma.Decimal(balance), updatedAt });
const movementRow = (over: Record<string, unknown> = {}) => ({
  id: 'b1a2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  clientId,
  kind: 'TOP_UP',
  amount: new Prisma.Decimal(100),
  balanceAfter: new Prisma.Decimal(100),
  reference: null,
  description: 'Recarga de saldo',
  occurredOn: new Date('2026-10-14T00:00:00.000Z'),
  idempotencyKey: key,
  fingerprint: 'TOP_UP|10000|2026-10-14|',
  createdAt: updatedAt,
  ...over,
});
const email = 'ana.lopez@debus.test';
const prismaError = (code: string) => Object.assign(new Error(code), { code });
const debit = {
  clientId,
  amount: 30,
  kind: 'TICKET' as const,
  reference: ticketId,
  description: 'Boleto Quetzaltenango - Guatemala',
  occurredOn: '2026-10-14',
};

function setup() {
  const tx = {
    walletMovement: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(async ({ data }: { data: { id: string } }) => data),
    },
    wallet: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn().mockResolvedValue(wallet(100)),
      findUniqueOrThrow: jest.fn().mockResolvedValue(wallet(100)),
    },
    refund: { findUnique: jest.fn().mockResolvedValue(null) },
  };
  const prisma = {
    $transaction: jest.fn(async (work: (client: typeof tx) => unknown) => work(tx)),
    wallet: { findUnique: jest.fn().mockResolvedValue(wallet(100)) },
    clientProfile: { findUnique: jest.fn().mockResolvedValue({ email }) },
    walletMovement: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
  };
  return { tx, prisma, service: new WalletService(prisma as never) };
}

describe('WalletService', () => {
  it('answers the balance, or that the account is being prepared', async () => {
    const { prisma, service } = setup();

    expect(await service.get(clientId)).toEqual({
      balance: 100,
      updatedAt: updatedAt.toISOString(),
    });
    prisma.wallet.findUnique.mockResolvedValue(null);
    await expect(service.get(clientId)).rejects.toThrow(NotFoundException);
  });

  it('tops up once: adds to the balance and records the movement with its key', async () => {
    const { tx, service } = setup();

    expect(await service.topUp(clientId, key, { amount: 100, paidOn: '2026-10-14' })).toEqual({
      balance: 100,
      updatedAt: updatedAt.toISOString(),
    });

    expect(tx.wallet.updateMany).toHaveBeenCalledWith({
      where: { clientId },
      data: { balance: { increment: 100 }, updatedAt: expect.any(Date) },
    });
    expect(tx.walletMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clientId,
        kind: 'TOP_UP',
        amount: 100,
        balanceAfter: new Prisma.Decimal(100),
        reference: null,
        description: 'Recarga de saldo',
        occurredOn: new Date('2026-10-14T00:00:00.000Z'),
        idempotencyKey: key,
        fingerprint: 'TOP_UP|10000|2026-10-14|',
      }),
    });
  });

  it('answers a repeated top-up without touching the balance again', async () => {
    const { tx, service } = setup();
    tx.walletMovement.findUnique.mockResolvedValue(movementRow());

    await service.topUp(clientId, key, { amount: 100, paidOn: '2026-10-14' });

    expect(tx.walletMovement.findUnique).toHaveBeenCalledWith({
      where: { clientId_idempotencyKey: { clientId, idempotencyKey: key } },
    });
    expect(tx.wallet.updateMany).not.toHaveBeenCalled();
    expect(tx.walletMovement.create).not.toHaveBeenCalled();
  });

  it('refuses a key already used for something else', async () => {
    const { tx, service } = setup();
    tx.walletMovement.findUnique.mockResolvedValue(movementRow());

    await expect(
      service.topUp(clientId, key, { amount: 200, paidOn: '2026-10-14' }),
    ).rejects.toThrow(ConflictException);
  });

  it('says the account is being prepared when there is no wallet to top up', async () => {
    const { tx, service } = setup();
    tx.wallet.updateMany.mockResolvedValue({ count: 0 });
    tx.wallet.findUnique.mockResolvedValue(null);

    await expect(
      service.topUp(clientId, key, { amount: 100, paidOn: '2026-10-14' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('answers with the movement of a request with the same key that committed first', async () => {
    const { prisma, service } = setup();
    prisma.$transaction.mockRejectedValueOnce(prismaError('P2002'));
    prisma.walletMovement.findUnique.mockResolvedValue(
      movementRow({
        kind: 'TICKET',
        amount: new Prisma.Decimal(-30),
        balanceAfter: new Prisma.Decimal(70),
        reference: ticketId,
        idempotencyKey: ticketId,
        fingerprint: `TICKET|3000|2026-10-14|${ticketId}`,
      }),
    );

    expect(await service.debit(ticketId, debit)).toEqual({
      movementId: 'b1a2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
      balance: 70,
      email,
    });
  });

  it('lets other failures and a lost race without a movement through', async () => {
    const { prisma, service } = setup();
    prisma.$transaction.mockRejectedValueOnce(new Error('down'));
    await expect(service.debit(ticketId, debit)).rejects.toThrow('down');

    prisma.$transaction.mockRejectedValueOnce(prismaError('P2002'));
    prisma.walletMovement.findUnique.mockResolvedValue(null);
    await expect(service.debit(ticketId, debit)).rejects.toMatchObject({ code: 'P2002' });
  });

  it('debits only when the balance covers it, and records a negative movement', async () => {
    const { tx, service } = setup();
    tx.wallet.findUniqueOrThrow.mockResolvedValue(wallet(70));

    const result = await service.debit(ticketId, debit);

    expect(tx.wallet.updateMany).toHaveBeenCalledWith({
      where: { clientId, balance: { gte: 30 } },
      data: { balance: { increment: -30 }, updatedAt: expect.any(Date) },
    });
    expect(tx.walletMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        kind: 'TICKET',
        amount: -30,
        balanceAfter: new Prisma.Decimal(70),
      }),
    });
    expect(result).toEqual({ movementId: expect.any(String), balance: 70, email });
  });

  it('answers a new debit with the email of the profile of the client', async () => {
    const { prisma, service } = setup();

    const result = await service.debit(ticketId, debit);

    expect(prisma.clientProfile.findUnique).toHaveBeenCalledWith({
      where: { userId: clientId },
      select: { email: true },
    });
    expect(result.email).toBe(email);
  });

  it('answers a repeated debit with the same email', async () => {
    const { tx, service } = setup();
    tx.walletMovement.findUnique.mockResolvedValue(
      movementRow({
        kind: 'TICKET',
        amount: new Prisma.Decimal(-30),
        balanceAfter: new Prisma.Decimal(70),
        reference: ticketId,
        idempotencyKey: ticketId,
        fingerprint: `TICKET|3000|2026-10-14|${ticketId}`,
      }),
    );

    const result = await service.debit(ticketId, debit);

    expect(result).toMatchObject({ balance: 70, email });
    expect(tx.wallet.updateMany).not.toHaveBeenCalled();
  });

  it('refuses a new debit after its payBy without touching the balance', async () => {
    const { tx, service } = setup();

    const error = await service
      .debit(ticketId, { ...debit, payBy: '2020-01-01T00:00:00.000Z' })
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(error).toMatchObject({ message: 'Se terminó el tiempo para pagar esta compra.' });
    expect(tx.wallet.updateMany).not.toHaveBeenCalled();
    expect(tx.walletMovement.create).not.toHaveBeenCalled();
  });

  it('answers a debit already applied with the same movement even after its payBy', async () => {
    const { tx, service } = setup();
    tx.walletMovement.findUnique.mockResolvedValue(
      movementRow({
        kind: 'TICKET',
        amount: new Prisma.Decimal(-30),
        balanceAfter: new Prisma.Decimal(70),
        reference: ticketId,
        idempotencyKey: ticketId,
        fingerprint: `TICKET|3000|2026-10-14|${ticketId}`,
      }),
    );

    const result = await service.debit(ticketId, { ...debit, payBy: '2020-01-01T00:00:00.000Z' });

    expect(result).toMatchObject({
      movementId: 'b1a2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
      balance: 70,
    });
  });

  it('refuses to charge a ticket whose trip was cancelled, once it holds the wallet', async () => {
    const { tx, service } = setup();
    tx.refund.findUnique.mockResolvedValue({ reference: ticketId });

    const error = await service.debit(ticketId, debit).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(error).toMatchObject({ message: 'Este viaje se canceló y ya no se puede pagar.' });
    expect(tx.refund.findUnique).toHaveBeenCalledWith({ where: { reference: ticketId } });
    // Checked after the update that locks the wallet, the same lock the refund takes.
    const [locked] = tx.wallet.updateMany.mock.invocationCallOrder;
    const [checked] = tx.refund.findUnique.mock.invocationCallOrder;
    expect(locked).toBeLessThan(checked ?? 0);
    expect(tx.walletMovement.create).not.toHaveBeenCalled();
  });

  it('answers a debit already applied even if its ticket was refunded later', async () => {
    const { tx, service } = setup();
    tx.refund.findUnique.mockResolvedValue({ reference: ticketId });
    tx.walletMovement.findUnique.mockResolvedValue(
      movementRow({
        kind: 'TICKET',
        amount: new Prisma.Decimal(-30),
        balanceAfter: new Prisma.Decimal(70),
        reference: ticketId,
        idempotencyKey: ticketId,
        fingerprint: `TICKET|3000|2026-10-14|${ticketId}`,
      }),
    );

    expect(await service.debit(ticketId, debit)).toMatchObject({ balance: 70 });
  });

  it('never looks for refunds on a top-up', async () => {
    const { tx, service } = setup();

    await service.topUp(clientId, key, { amount: 100, paidOn: '2026-10-14' });

    expect(tx.refund.findUnique).not.toHaveBeenCalled();
  });

  it('applies a debit whose payBy has not arrived, and keeps it out of the fingerprint', async () => {
    const { tx, service } = setup();
    tx.wallet.findUniqueOrThrow.mockResolvedValue(wallet(70));

    await service.debit(ticketId, { ...debit, payBy: '2999-01-01T00:00:00.000Z' });

    expect(tx.walletMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ fingerprint: `TICKET|3000|2026-10-14|${ticketId}` }),
    });
  });

  it('refuses a debit the balance does not cover, or without a wallet', async () => {
    const { tx, service } = setup();
    tx.wallet.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.debit(ticketId, debit)).rejects.toThrow(UnprocessableEntityException);
    tx.wallet.findUnique.mockResolvedValue(null);
    await expect(service.debit(ticketId, debit)).rejects.toThrow(NotFoundException);
  });

  it('requires the idempotency key to be the reference it pays', async () => {
    const { service } = setup();

    await expect(service.debit(key, debit)).rejects.toThrow(BadRequestException);
  });

  it('lists movements newest first, filtered and paged on the server', async () => {
    const { prisma, service } = setup();
    prisma.walletMovement.findMany.mockResolvedValue([movementRow()]);
    prisma.walletMovement.count.mockResolvedValue(21);

    const page = await service.movements(clientId, {
      kind: 'TOP_UP',
      from: '2026-10-01',
      to: '2026-10-31',
      page: 2,
      pageSize: 20,
    });

    const where = {
      clientId,
      kind: 'TOP_UP',
      occurredOn: {
        gte: new Date('2026-10-01T00:00:00.000Z'),
        lte: new Date('2026-10-31T00:00:00.000Z'),
      },
    };
    expect(prisma.walletMovement.findMany).toHaveBeenCalledWith({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: 20,
      take: 20,
    });
    expect(prisma.walletMovement.count).toHaveBeenCalledWith({ where });
    expect(page).toEqual({
      items: [
        {
          id: 'b1a2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
          kind: 'TOP_UP',
          amount: 100,
          balanceAfter: 100,
          reference: null,
          description: 'Recarga de saldo',
          occurredOn: '2026-10-14',
          createdAt: updatedAt.toISOString(),
        },
      ],
      total: 21,
      page: 2,
      pageSize: 20,
    });
  });

  it('lists every kind and date when no filter is chosen', async () => {
    const { prisma, service } = setup();

    await service.movements(clientId, { kind: 'all', page: 1, pageSize: 20 });

    expect(prisma.walletMovement.count).toHaveBeenCalledWith({ where: { clientId } });
  });
});
