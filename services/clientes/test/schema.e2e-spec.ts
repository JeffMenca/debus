import { randomUUID } from 'node:crypto';
import { isConstraintViolation, isUniqueViolation } from '@debus/server';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './support/app';
import { testProfiles } from './support/profiles';

async function refusal(work: Promise<unknown>): Promise<unknown> {
  try {
    await work;
  } catch (error) {
    return error;
  }
  return undefined;
}

describe('profiles and wallets schema', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let profiles: ReturnType<typeof testProfiles>;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    profiles = testProfiles(prisma);
  });
  afterAll(async () => {
    await profiles.cleanUp();
    await app.close();
  });

  it('never lets a balance go below zero', async () => {
    const clientId = await profiles.create({ balance: 10 });

    const error = await refusal(
      prisma.wallet.update({ where: { clientId }, data: { balance: { decrement: 11 } } }),
    );

    expect(isConstraintViolation(error, 'wallets_balance_non_negative')).toBe(true);
  });

  it('keeps a NIT on a single profile while any number of them have none', async () => {
    const nit = `9${Date.now()}`.slice(0, 12);
    await profiles.create({ nit });
    await profiles.create();
    await profiles.create();

    expect(isUniqueViolation(await refusal(profiles.create({ nit })))).toBe(true);
  });

  it('records an idempotency key once per wallet', async () => {
    const clientId = await profiles.create({ balance: 50 });
    const movement = () => ({
      id: randomUUID(),
      clientId,
      kind: 'TOP_UP' as const,
      amount: 50,
      balanceAfter: 50,
      description: 'Recarga de saldo',
      occurredOn: new Date('2026-10-14'),
      idempotencyKey: '3f2e4d1c-8b0a-4f8e-9d6c-5b4a3f2e4d1c',
      fingerprint: 'TOP_UP|5000|2026-10-14|',
    });
    await prisma.walletMovement.create({ data: movement() });

    expect(
      isUniqueViolation(await refusal(prisma.walletMovement.create({ data: movement() }))),
    ).toBe(true);
  });

  it('marks a ticket as refunded once, and forgets the mark with the profile', async () => {
    const clientId = await profiles.create();
    const reference = randomUUID();
    const refund = () =>
      prisma.refund.create({ data: { reference, clientId, amount: 0, reason: 'TRIP_DELETED' } });
    await refund();

    expect(isUniqueViolation(await refusal(refund()))).toBe(true);
    await prisma.clientProfile.delete({ where: { userId: clientId } });
    expect(await prisma.refund.count({ where: { reference } })).toBe(0);
  });
});
