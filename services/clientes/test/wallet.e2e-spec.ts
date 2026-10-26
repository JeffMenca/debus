import { randomUUID } from 'node:crypto';
import { WALLET_DEBIT_PATH } from '@debus/contracts';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './support/app';
import { identityHeaders } from './support/identity';
import { testProfiles } from './support/profiles';

describe('profile and wallet API', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let profiles: ReturnType<typeof testProfiles>;
  const server = () => app.getHttpServer();
  const topUp = (clientId: string, amount: number, key: string = randomUUID()) =>
    request(server())
      .post('/wallet/top-ups')
      .set(identityHeaders(clientId))
      .set('idempotency-key', key)
      .send({ amount, paidOn: '2026-10-14' });
  const debit = (clientId: string, amount: number, reference: string = randomUUID()) =>
    request(server()).post(WALLET_DEBIT_PATH).set('idempotency-key', reference).send({
      clientId,
      amount,
      kind: 'TICKET',
      reference,
      description: 'Boleto de prueba',
      occurredOn: '2026-10-14',
    });

  const debitBy = (clientId: string, amount: number, reference: string, payBy: string) =>
    request(server()).post(WALLET_DEBIT_PATH).set('idempotency-key', reference).send({
      clientId,
      amount,
      kind: 'TICKET',
      reference,
      description: 'Boleto de prueba',
      occurredOn: '2026-10-14',
      payBy,
    });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    profiles = testProfiles(prisma);
  });
  afterAll(async () => {
    await profiles.cleanUp();
    await app.close();
  });

  it('asks for a session', async () => {
    await request(server()).get('/wallet').expect(401);
    await request(server()).get('/profile').expect(401);
  });

  it('says the account is being prepared before UserRegistered arrives', async () => {
    const response = await request(server())
      .get('/wallet')
      .set(identityHeaders(randomUUID()))
      .expect(404);

    expect(response.body.message).toContain('preparando tu cuenta');
  });

  it('tops up once per key and lists the movement', async () => {
    const clientId = await profiles.create();
    const key = randomUUID();

    const first = await topUp(clientId, 150.5, key).expect(201);
    await topUp(clientId, 150.5, key).expect(201);
    await topUp(clientId, 99, key).expect(409);
    await topUp(clientId, 10, 'not-a-uuid').expect(400);

    expect(first.body.balance).toBe(150.5);
    const wallet = await request(server()).get('/wallet').set(identityHeaders(clientId));
    expect(wallet.body.balance).toBe(150.5);
    const movements = await request(server())
      .get('/wallet/movements')
      .set(identityHeaders(clientId))
      .expect(200);
    expect(movements.body).toMatchObject({ total: 1, page: 1, pageSize: 20 });
    expect(movements.body.items[0]).toMatchObject({
      kind: 'TOP_UP',
      amount: 150.5,
      balanceAfter: 150.5,
      description: 'Recarga de saldo',
      occurredOn: '2026-10-14',
    });
    expect(await profiles.announced(clientId, 'WalletCredited')).toEqual([
      expect.objectContaining({
        movementId: movements.body.items[0].id,
        kind: 'TOP_UP',
        amount: 150.5,
        balanceAfter: 150.5,
        fullName: 'Cliente de prueba',
      }),
    ]);
  });

  it('announces no credit for a debit', async () => {
    const clientId = await profiles.create({ balance: 50 });

    await debit(clientId, 30).expect(200);

    expect(await profiles.announced(clientId, 'WalletCredited')).toEqual([]);
  });

  it('never overdraws a wallet however many debits arrive together', async () => {
    const clientId = await profiles.create({ balance: 100 });

    const responses = await Promise.all(Array.from({ length: 10 }, () => debit(clientId, 30)));

    const statuses = responses.map((response) => response.status).sort();
    expect(statuses.filter((status) => status === 200)).toHaveLength(3);
    expect(statuses.filter((status) => status === 422)).toHaveLength(7);
    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { clientId } });
    expect(wallet.balance.toNumber()).toBe(10);
    expect(await prisma.walletMovement.count({ where: { clientId } })).toBe(3);
  });

  it('debits a ticket once however many times ventas retries it at the same time', async () => {
    const clientId = await profiles.create({ balance: 100 });
    const ticketId = randomUUID();

    const responses = await Promise.all(
      Array.from({ length: 5 }, () => debit(clientId, 30, ticketId)),
    );

    expect(responses.map((response) => response.status)).toEqual([200, 200, 200, 200, 200]);
    expect(new Set(responses.map((response) => response.body.movementId)).size).toBe(1);
    expect(responses[0]?.body.balance).toBe(70);
    expect(await prisma.walletMovement.count({ where: { clientId } })).toBe(1);
  });

  it('answers a debit with the email of the client, the first time and when it is repeated', async () => {
    const clientId = await profiles.create({ balance: 100 });
    const { email } = await prisma.clientProfile.findUniqueOrThrow({ where: { userId: clientId } });
    const ticketId = randomUUID();

    const first = await debit(clientId, 30, ticketId).expect(200);
    const again = await debit(clientId, 30, ticketId).expect(200);

    expect(first.body).toMatchObject({ balance: 70, email });
    expect(again.body).toEqual(first.body);
  });

  it('refuses a new debit after its payBy and leaves the balance as it was', async () => {
    const clientId = await profiles.create({ balance: 100 });
    const reference = randomUUID();

    const response = await debitBy(clientId, 30, reference, '2020-01-01T00:00:00.000Z').expect(422);

    expect(response.body.message).toBe('Se terminó el tiempo para pagar esta compra.');
    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { clientId } });
    expect(wallet.balance.toNumber()).toBe(100);
    expect(await prisma.walletMovement.count({ where: { clientId } })).toBe(0);
  });

  it('answers a debit that was applied in time again after its payBy, with one movement', async () => {
    const clientId = await profiles.create({ balance: 100 });
    const { email } = await prisma.clientProfile.findUniqueOrThrow({ where: { userId: clientId } });
    const reference = randomUUID();
    const soon = new Date(Date.now() + 60_000).toISOString();
    const first = await debitBy(clientId, 30, reference, soon).expect(200);

    const late = await debitBy(clientId, 30, reference, '2020-01-01T00:00:00.000Z').expect(200);

    expect(late.body).toEqual(first.body);
    expect(late.body.email).toBe(email);
    expect(await prisma.walletMovement.count({ where: { clientId } })).toBe(1);
  });

  it('refuses a payBy that is not an ISO date and time', async () => {
    const clientId = await profiles.create({ balance: 100 });

    await debitBy(clientId, 30, randomUUID(), 'tomorrow').expect(400);
  });

  it('refuses a debit whose key is not the reference it pays, or for nobody', async () => {
    const clientId = await profiles.create({ balance: 100 });

    await request(server())
      .post(WALLET_DEBIT_PATH)
      .set('idempotency-key', randomUUID())
      .send({
        clientId,
        amount: 10,
        kind: 'TICKET',
        reference: randomUUID(),
        description: 'Boleto',
        occurredOn: '2026-10-14',
      })
      .expect(400);
    await debit(randomUUID(), 10).expect(404);
  });

  it('pages and filters movements on the server', async () => {
    const clientId = await profiles.create({ balance: 500 });
    for (let index = 0; index < 3; index += 1) await topUp(clientId, 10).expect(201);
    await debit(clientId, 5).expect(200);

    const tickets = await request(server())
      .get('/wallet/movements?kind=TICKET')
      .set(identityHeaders(clientId))
      .expect(200);
    const second = await request(server())
      .get('/wallet/movements?pageSize=20&page=1')
      .set(identityHeaders(clientId))
      .expect(200);

    expect(tickets.body).toMatchObject({ total: 1, items: [{ kind: 'TICKET', amount: -5 }] });
    expect(second.body.items.map((item: { kind: string }) => item.kind)).toEqual([
      'TICKET',
      'TOP_UP',
      'TOP_UP',
      'TOP_UP',
    ]);
    await request(server())
      .get('/wallet/movements?from=2026-10-20&to=2026-10-01')
      .set(identityHeaders(clientId))
      .expect(400);
  });

  it('edits the profile and keeps each NIT on one account', async () => {
    const taken = `7${Date.now()}`.slice(0, 12);
    await profiles.create({ nit: taken });
    const clientId = await profiles.create();
    const edit = (nit: string) =>
      request(server())
        .put('/profile')
        .set(identityHeaders(clientId))
        .send({ dpi: '2734 51920 0901', phone: '5512-3489', nit, address: 'Zona 1' });

    const saved = await edit('1234567-k').expect(200);
    const conflict = await edit(taken).expect(409);

    expect(saved.body).toMatchObject({
      dpi: '2734519200901',
      phone: '55123489',
      nit: '1234567K',
      address: 'Zona 1',
    });
    expect(conflict.body.message).toBe('Ese NIT ya está registrado en otra cuenta.');
    const profile = await request(server()).get('/profile').set(identityHeaders(clientId));
    expect(profile.body.nit).toBe('1234567K');
    // Only the saved edit reaches ventas; the refused one leaves nothing behind.
    expect(await profiles.announced(clientId)).toEqual([
      expect.objectContaining({ clientId, nit: '1234567K' }),
    ]);
  });
});
