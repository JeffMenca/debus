import { randomInt, randomUUID } from 'node:crypto';
import { type Rental, exampleRentalCancelled } from '@debus/contracts';
import { InMemoryEventBus } from '@debus/messaging';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './support/app';
import { identityHeaders } from './support/identity';
import { testProfiles } from './support/profiles';
import { RENTAL_TRIP, futureDeparture, rentalRate, testRentals } from './support/rentals';

describe('private rentals', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let bus: InMemoryEventBus;
  let profiles: ReturnType<typeof testProfiles>;
  let rentals: ReturnType<typeof testRentals>;
  let rate: Awaited<ReturnType<typeof rentalRate>>;
  const branchId = randomUUID();
  const adminId = randomUUID();
  const admin = identityHeaders(adminId, 'BRANCH_ADMIN', branchId);
  const server = () => app.getHttpServer();
  const paidOn = '2026-10-21';

  const trip = () => ({ branchId, ...RENTAL_TRIP, departureAt: futureDeparture(), returnAt: null });
  const uniqueNit = () => `7${randomInt(1e10).toString().padStart(10, '0')}`;
  const balanceOf = async (clientId: string) =>
    (await prisma.wallet.findUniqueOrThrow({ where: { clientId } })).balance.toNumber();

  const ask = async (clientId: string): Promise<Rental> => {
    const { body } = await request(server())
      .post('/rentals')
      .set(identityHeaders(clientId))
      .send(trip())
      .expect(201);
    rentals.track(body.id);
    return body;
  };
  const confirm = (rentalId: string, body: object = { price: 2500 }) =>
    request(server()).post(`/branch-rentals/${rentalId}/confirm`).set(admin).send(body);
  const pay = (rentalId: string, headers: object, key = rentalId) =>
    request(server())
      .post(`/rentals/${rentalId}/pay`)
      .set(headers as Record<string, string>)
      .set('idempotency-key', key)
      .send({ paidOn });
  const confirmedFor = async (clientId: string) => {
    const rental = await ask(clientId);
    await confirm(rental.id).expect(201);
    return rental;
  };

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
    rentals = testRentals(prisma);
    rate = await rentalRate(prisma);
  });
  afterAll(async () => {
    await rentals.cleanUp();
    await profiles.cleanUp();
    await rate.remove();
    await app.close();
  });

  it('estimates with the rate in force', async () => {
    const { body } = await request(server())
      .get('/rentals/estimate?distanceKm=92')
      .set(identityHeaders(randomUUID()))
      .expect(200);

    expect(body).toMatchObject({ ratePerKm: rate.ratePerKm, estimatedPrice: 92 * rate.ratePerKm });
  });

  it('goes from request to confirmed price to paid from the wallet, once', async () => {
    const nit = uniqueNit();
    const clientId = await profiles.create({ balance: 3000, nit });

    const asked = await ask(clientId);
    expect(asked).toMatchObject({
      status: 'REQUESTED',
      channel: 'ONLINE',
      nit,
      estimatedPrice: 92 * rate.ratePerKm,
      price: null,
    });

    const { body: confirmed } = await confirm(asked.id, { price: 2500, distanceKm: 95 }).expect(
      201,
    );
    expect(confirmed).toMatchObject({ status: 'CONFIRMED', price: 2500, distanceKm: 95 });
    expect(await rentals.announced(asked.id, 'RentalConfirmed')).toEqual([
      expect.objectContaining({ rentalId: asked.id, clientId, price: 2500, distanceKm: 95 }),
    ]);

    const { body: paid } = await pay(asked.id, identityHeaders(clientId)).expect(201);
    await pay(asked.id, identityHeaders(clientId)).expect(201);

    expect(paid).toMatchObject({ status: 'PAID', paidOn });
    expect(await balanceOf(clientId)).toBe(500);
    const movements = await prisma.walletMovement.findMany({ where: { reference: asked.id } });
    expect(movements.map((m) => [m.kind, m.amount.toNumber()])).toEqual([['RENTAL', -2500]]);
    expect(await rentals.announced(asked.id, 'RentalPaid')).toEqual([
      expect.objectContaining({
        rentalId: asked.id,
        branchId,
        clientId,
        nit,
        price: 2500,
        paidOn,
        email: expect.stringContaining('@debus.test'),
      }),
    ]);
  });

  it('charges 20 simultaneous payments of the same rental exactly once', async () => {
    const clientId = await profiles.create({ balance: 3000 });
    const { id } = await confirmedFor(clientId);

    const answers = await Promise.all(
      Array.from({ length: 20 }, () => pay(id, identityHeaders(clientId))),
    );

    expect(answers.map((answer) => answer.status)).toEqual(Array(20).fill(201));
    expect(await prisma.walletMovement.count({ where: { reference: id } })).toBe(1);
    expect(await rentals.announced(id, 'RentalPaid')).toHaveLength(1);
    expect(await balanceOf(clientId)).toBe(500);
  });

  it('refuses a payment that waited behind a cancellation of the same rental', async () => {
    const clientId = await profiles.create({ balance: 3000 });
    const { id } = await confirmedFor(clientId);

    let release: () => void = () => {};
    let markLocked: () => void = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    const locked = new Promise<void>((resolve) => (markLocked = resolve));
    // Holds the rental the way a cancellation does, cancels it, and commits only once the payment
    // is waiting on that lock: the order is forced, not left to timing.
    const cancelling = prisma.$transaction(
      async (tx) => {
        await tx.$queryRawUnsafe('SELECT id FROM rentals WHERE id = $1::uuid FOR UPDATE', id);
        await tx.rental.update({
          where: { id },
          data: { status: 'CANCELLED', cancelledAt: new Date() },
        });
        markLocked();
        await held;
      },
      { timeout: 20_000 },
    );
    await locked;
    const answer = pay(id, identityHeaders(clientId)).then((response) => response);
    await untilWaiting('SELECT id FROM rentals WHERE id');
    release();
    await cancelling;

    expect((await answer).status).toBe(409);
    expect(await balanceOf(clientId)).toBe(3000);
    expect(await rentals.announced(id, 'RentalPaid')).toEqual([]);
  });

  it('leaves the rental confirmed when the balance does not cover it', async () => {
    const clientId = await profiles.create({ balance: 100 });
    const { id } = await confirmedFor(clientId);

    await pay(id, identityHeaders(clientId)).expect(422);

    expect(await prisma.rental.findUniqueOrThrow({ where: { id } })).toMatchObject({
      status: 'CONFIRMED',
    });
    expect(await rentals.announced(id, 'RentalPaid')).toEqual([]);
  });

  it('records a walk-in rental, takes its cash and shows it to the client of that NIT', async () => {
    const nit = uniqueNit();
    const { body: counter } = await request(server())
      .post('/branch-rentals')
      .set(admin)
      .send({ ...trip(), nit, clientName: 'Colegio San José', email: null, price: 2600 })
      .expect(201);
    rentals.track(counter.id);
    expect(counter).toMatchObject({ status: 'CONFIRMED', channel: 'COUNTER', clientId: null });

    const { body: paid } = await pay(counter.id, admin).expect(201);
    expect(paid.status).toBe('PAID');
    expect(await rentals.announced(counter.id, 'RentalPaid')).toEqual([
      expect.objectContaining({ clientId: null, email: null, nit, price: 2600 }),
    ]);

    const clientId = await profiles.create({ nit });
    const { body: history } = await request(server())
      .get('/rentals/mine')
      .set(identityHeaders(clientId))
      .expect(200);
    expect(history.items.map((rental: Rental) => rental.id)).toEqual([counter.id]);
    // It can see it but not act on it: the branch took the cash.
    await request(server())
      .post(`/rentals/${counter.id}/cancel`)
      .set(identityHeaders(clientId))
      .expect(404);
  });

  it('lists the rentals of the branch and keeps them from other branches', async () => {
    const clientId = await profiles.create();
    const { id } = await ask(clientId);

    const { body } = await request(server())
      .get('/branch-rentals?status=REQUESTED')
      .set(admin)
      .expect(200);
    expect(body.items.map((rental: Rental) => rental.id)).toContain(id);

    const other = identityHeaders(randomUUID(), 'BRANCH_ADMIN', randomUUID());
    await request(server())
      .post(`/branch-rentals/${id}/confirm`)
      .set(other)
      .send({ price: 1 })
      .expect(404);
    await request(server()).get('/branch-rentals').set(identityHeaders(clientId)).expect(403);
  });

  it('cancels what is not paid and leaves a paid rental to viajes', async () => {
    const clientId = await profiles.create({ balance: 3000 });
    const unpaid = await ask(clientId);
    const { body } = await request(server())
      .post(`/rentals/${unpaid.id}/cancel`)
      .set(identityHeaders(clientId))
      .expect(201);
    expect(body.status).toBe('CANCELLED');

    const { id } = await confirmedFor(clientId);
    await pay(id, identityHeaders(clientId)).expect(201);
    await request(server()).post(`/rentals/${id}/cancel`).set(admin).expect(409);
  });

  it('gives a cancelled paid rental back to the wallet once, however often it is told', async () => {
    const clientId = await profiles.create({ balance: 3000 });
    const { id } = await confirmedFor(clientId);
    await pay(id, identityHeaders(clientId)).expect(201);
    const cancelled = { ...exampleRentalCancelled, rentalId: id, branchId };

    await bus.deliver('RentalCancelled', cancelled);
    await bus.deliver('RentalCancelled', cancelled);

    expect(await prisma.rental.findUniqueOrThrow({ where: { id } })).toMatchObject({
      status: 'CANCELLED',
    });
    expect(await balanceOf(clientId)).toBe(3000);
    const refunds = await prisma.walletMovement.findMany({
      where: { reference: id, kind: 'REFUND' },
    });
    expect(refunds.map((m) => m.amount.toNumber())).toEqual([2500]);
    expect(await profiles.announced(clientId, 'WalletCredited')).toEqual([
      expect.objectContaining({ kind: 'REFUND', amount: 2500 }),
    ]);
  });

  it('only marks a cancelled counter rental: its cash goes back at the counter', async () => {
    const id = await rentals.insert({
      branchId,
      status: 'PAID',
      price: 2600,
      paidOn: new Date('2026-10-21T00:00:00.000Z'),
      paidAt: new Date(),
    });

    await bus.deliver('RentalCancelled', { ...exampleRentalCancelled, rentalId: id, branchId });

    expect(await prisma.rental.findUniqueOrThrow({ where: { id } })).toMatchObject({
      status: 'CANCELLED',
    });
    expect(await prisma.refund.findUnique({ where: { reference: id } })).toBeNull();
  });
});
