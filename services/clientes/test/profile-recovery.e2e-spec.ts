import { randomUUID } from 'node:crypto';
import { testEmail } from '@debus/config/test-data';
import { InMemoryEventBus } from '@debus/messaging';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './support/app';
import { identityHeaders } from './support/identity';
import { testProfiles } from './support/profiles';

describe('profile recovery from republished accounts', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let bus: InMemoryEventBus;
  let profiles: ReturnType<typeof testProfiles>;

  const account = (over: Record<string, unknown> = {}) => {
    const userId = randomUUID();
    profiles.track(userId);
    return {
      userId,
      email: testEmail('recuperado'),
      fullName: 'Carlos Cajero',
      role: 'CASHIER',
      branchId: randomUUID(),
      active: true,
      version: 2,
      ...over,
    };
  };
  const registration = (user: ReturnType<typeof account>, profile: Record<string, unknown>) => ({
    userId: user.userId,
    email: user.email,
    fullName: user.fullName,
    role: 'CLIENT',
    branchId: null,
    profile,
  });
  const clientData = { dpi: '2734519200901', phone: '55123489', nit: null, address: 'Zona 3' };

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

  it('gives an account without a profile its profile, its wallet and tells ventas', async () => {
    const user = account();
    await request(app.getHttpServer())
      .get('/profile')
      .set(identityHeaders(user.userId, user.role, user.branchId))
      .expect(404);

    await bus.deliver('UserUpdated', user);

    const response = await request(app.getHttpServer())
      .get('/profile')
      .set(identityHeaders(user.userId, user.role, user.branchId))
      .expect(200);
    expect(response.body).toMatchObject({ email: user.email, fullName: user.fullName });
    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { clientId: user.userId } });
    expect(wallet.balance.toNumber()).toBe(0);
    expect(await profiles.announced(user.userId)).toEqual([
      expect.objectContaining({ clientId: user.userId, nit: null, fullName: user.fullName }),
    ]);
  });

  it('neither duplicates nor announces again when the account is republished', async () => {
    const user = account();

    await bus.deliver('UserUpdated', user);
    await bus.deliver('UserUpdated', { ...user, version: 3 });
    await bus.deliver('UserUpdated', { ...user, version: 3, fullName: 'Otro nombre' });

    expect(await prisma.clientProfile.count({ where: { userId: user.userId } })).toBe(1);
    expect(await profiles.announced(user.userId)).toHaveLength(1);
    expect(
      await prisma.clientProfile.findUniqueOrThrow({ where: { userId: user.userId } }),
    ).toMatchObject({ fullName: user.fullName });
  });

  it('creates no profile for an account that was deactivated', async () => {
    const user = account({ active: false });

    await bus.deliver('UserUpdated', user);

    expect(await prisma.clientProfile.count({ where: { userId: user.userId } })).toBe(0);
  });

  it('completes a recovered profile with the registration that arrives later', async () => {
    const user = account({ role: 'CLIENT', branchId: null });
    await bus.deliver('UserUpdated', user);

    await bus.deliver('UserRegistered', registration(user, clientData));

    expect(
      await prisma.clientProfile.findUniqueOrThrow({ where: { userId: user.userId } }),
    ).toMatchObject({ dpi: '2734519200901', phone: '55123489', address: 'Zona 3' });
    expect(await profiles.announced(user.userId)).toHaveLength(2);
  });

  it('never overwrites a profile that already holds its data', async () => {
    const user = account({ role: 'CLIENT', branchId: null });
    await bus.deliver('UserRegistered', registration(user, clientData));

    await bus.deliver(
      'UserRegistered',
      registration(user, { ...clientData, dpi: '1111111111111', phone: '40000000' }),
    );
    await bus.deliver('UserUpdated', user);

    expect(
      await prisma.clientProfile.findUniqueOrThrow({ where: { userId: user.userId } }),
    ).toMatchObject({ dpi: '2734519200901', phone: '55123489' });
    expect(await profiles.announced(user.userId)).toHaveLength(1);
  });
});
