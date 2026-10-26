import { randomUUID } from 'node:crypto';
import { WALLET_DEBIT_PATH, exampleRefundRequested } from '@debus/contracts';
import { InMemoryEventBus } from '@debus/messaging';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './support/app';
import { testProfiles } from './support/profiles';

describe('refunds of the tickets of a deleted trip', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let bus: InMemoryEventBus;
  let profiles: ReturnType<typeof testProfiles>;
  const server = () => app.getHttpServer();

  const debit = (clientId: string, reference: string, amount = 85) =>
    request(server()).post(WALLET_DEBIT_PATH).set('idempotency-key', reference).send({
      clientId,
      amount,
      kind: 'TICKET',
      reference,
      description: 'Boleto Quetzaltenango - Guatemala, asiento 5',
      occurredOn: '2026-10-21',
    });
  const refundRequested = (clientId: string, ticketId: string, amount = 85) => ({
    ...exampleRefundRequested,
    ticketId,
    clientId,
    seats: [5],
    amount,
    requestedAt: '2026-10-21T15:00:00.000Z',
  });
  const balanceOf = async (clientId: string) =>
    (await prisma.wallet.findUniqueOrThrow({ where: { clientId } })).balance.toNumber();
  const movementsOf = (clientId: string, reference: string) =>
    prisma.walletMovement.findMany({
      where: { clientId, reference },
      orderBy: { createdAt: 'asc' },
    });

  // Waits until a session of this database is blocked on a lock while running that statement.
  const untilWaiting = async (statement: string) => {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const [{ waiting }] = await prisma.$queryRawUnsafe<[{ waiting: number }]>(
        `SELECT count(*)::int AS waiting FROM pg_stat_activity
         WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE $1`,
        `${statement}%`,
      );
      if (waiting > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`nothing waited on: ${statement}`);
  };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    bus = InMemoryEventBus.attach(app);
    profiles = testProfiles(prisma);
  });
  afterAll(async () => {
    await profiles.cleanUp();
    await app.close();
  });

  it('gives back what the ticket cost, once, however many times it is asked', async () => {
    const clientId = await profiles.create({ balance: 100 });
    const ticketId = randomUUID();
    await debit(clientId, ticketId).expect(200);

    await bus.deliver('RefundRequested', refundRequested(clientId, ticketId));
    await bus.deliver('RefundRequested', refundRequested(clientId, ticketId));

    expect(await balanceOf(clientId)).toBe(100);
    const movements = await movementsOf(clientId, ticketId);
    expect(movements.map((m) => [m.kind, m.amount.toNumber(), m.balanceAfter.toNumber()])).toEqual([
      ['TICKET', -85, 15],
      ['REFUND', 85, 100],
    ]);
    expect(movements[1]).toMatchObject({
      description: 'Devolución: Boleto Quetzaltenango - Guatemala, asiento 5',
      occurredOn: new Date('2026-10-21T00:00:00.000Z'),
    });
    expect(await prisma.refund.findUniqueOrThrow({ where: { reference: ticketId } })).toMatchObject(
      { movementId: movements[1]?.id, reason: 'TRIP_DELETED' },
    );
    expect(await profiles.announced(clientId, 'WalletCredited')).toEqual([
      expect.objectContaining({
        movementId: movements[1]?.id,
        kind: 'REFUND',
        amount: 85,
        balanceAfter: 100,
        description: 'Devolución: Boleto Quetzaltenango - Guatemala, asiento 5',
      }),
    ]);
  });

  it('refunds what the debit charged, not what the request says', async () => {
    const clientId = await profiles.create({ balance: 100 });
    const ticketId = randomUUID();
    await debit(clientId, ticketId, 70).expect(200);

    await bus.deliver('RefundRequested', refundRequested(clientId, ticketId, 85));

    expect(await balanceOf(clientId)).toBe(100);
  });

  it('gives nothing back when nothing was charged, and a late debit is refused', async () => {
    const clientId = await profiles.create({ balance: 100 });
    const ticketId = randomUUID();

    await bus.deliver('RefundRequested', refundRequested(clientId, ticketId));
    const late = await debit(clientId, ticketId).expect(422);

    expect(late.body.message).toBe('Este viaje se canceló y ya no se puede pagar.');
    expect(await balanceOf(clientId)).toBe(100);
    expect(await movementsOf(clientId, ticketId)).toEqual([]);
    expect(await profiles.announced(clientId, 'WalletCredited')).toEqual([]);
  });

  // The order that failed in CI, forced: the refund's transaction begins, the debit commits while
  // it waits, and only then does the refund write its movement.
  it('lists a refund after the debit it gives back, even when its transaction began first', async () => {
    const clientId = await profiles.create({ balance: 100 });
    const ticketId = randomUUID();
    const eventId = randomUUID();
    let release = () => {};
    const released = new Promise<void>((resolve) => (release = resolve));
    let holding = () => {};
    const held = new Promise<void>((resolve) => (holding = resolve));
    // An uncommitted row with the same event id makes the inbox of the refund wait on it.
    const blocker = prisma
      .$transaction(
        async (tx) => {
          await tx.$executeRawUnsafe(
            'INSERT INTO processed_events (event_id, type) VALUES ($1, $2)',
            eventId,
            'RefundRequested',
          );
          holding();
          await released;
          throw new Error('rolled back on purpose');
        },
        { timeout: 30_000 },
      )
      .catch(() => undefined);
    await held;

    const refund = bus.deliver('RefundRequested', refundRequested(clientId, ticketId), { eventId });
    await untilWaiting('INSERT INTO processed_events');
    await debit(clientId, ticketId).expect(200);
    release();
    await blocker;
    await refund;

    expect(await balanceOf(clientId)).toBe(100);
    expect((await movementsOf(clientId, ticketId)).map((m) => m.kind)).toEqual([
      'TICKET',
      'REFUND',
    ]);
  });

  it('never keeps the money when a debit and its refund arrive at the same time', async () => {
    const clientId = await profiles.create({ balance: 500 });
    const tickets = Array.from({ length: 5 }, () => randomUUID());

    await Promise.all(
      tickets.flatMap((ticketId) => [
        debit(clientId, ticketId).then(() => undefined),
        bus.deliver('RefundRequested', refundRequested(clientId, ticketId)),
      ]),
    );

    expect(await balanceOf(clientId)).toBe(500);
    for (const ticketId of tickets) {
      // Only the money is checked here; the order is the test above.
      const kinds = (await movementsOf(clientId, ticketId)).map((m) => m.kind).sort();
      expect([[], ['REFUND', 'TICKET']]).toContainEqual(kinds);
    }
  });

  it('ignores a refund for a client it does not know', async () => {
    const ticketId = randomUUID();

    await bus.deliver('RefundRequested', refundRequested(randomUUID(), ticketId));

    expect(await prisma.refund.count({ where: { reference: ticketId } })).toBe(0);
  });
});
