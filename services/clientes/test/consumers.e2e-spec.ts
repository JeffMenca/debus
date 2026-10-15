import { randomUUID } from 'node:crypto';
import { testEmail } from '@debus/config/test-data';
import { InMemoryEventBus } from '@debus/messaging';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { SettingsCopyService } from '../src/settings/settings-copy.service';
import { createTestApp } from './support/app';
import { testProfiles } from './support/profiles';

describe('events clientes consumes', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let bus: InMemoryEventBus;
  let profiles: ReturnType<typeof testProfiles>;
  const versions: string[] = [];

  const registered = (over: Record<string, unknown> = {}) => {
    const userId = randomUUID();
    profiles.track(userId);
    return {
      userId,
      email: testEmail('registro'),
      fullName: 'Ana Méndez',
      role: 'CLIENT',
      branchId: null,
      profile: { dpi: '2734519200901', phone: '55123489', nit: null, address: 'Zona 3' },
      ...over,
    };
  };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    bus = InMemoryEventBus.attach(app);
    profiles = testProfiles(prisma);
  });
  afterAll(async () => {
    await profiles.cleanUp();
    await prisma.settingsVersionCopy.deleteMany({ where: { id: { in: versions } } });
    await app.close();
  });

  it('creates the profile and an empty wallet once, however many times it arrives', async () => {
    const payload = registered();
    const eventId = randomUUID();

    await bus.deliver('UserRegistered', payload, { eventId });
    await bus.deliver('UserRegistered', payload, { eventId });
    await bus.deliver('UserRegistered', payload);

    const profile = await prisma.clientProfile.findUniqueOrThrow({
      where: { userId: payload.userId },
      include: { wallet: true },
    });
    expect(profile).toMatchObject({ dpi: '2734519200901', address: 'Zona 3', nit: null });
    expect(profile.wallet?.balance.toNumber()).toBe(0);
  });

  it('gives staff a profile with the client fields empty', async () => {
    const payload = registered({ role: 'CASHIER', branchId: randomUUID(), profile: null });

    await bus.deliver('UserRegistered', payload);

    expect(
      await prisma.clientProfile.findUniqueOrThrow({ where: { userId: payload.userId } }),
    ).toMatchObject({ role: 'CASHIER', dpi: null, phone: null });
  });

  it('drops a NIT that another profile already holds', async () => {
    const nit = `8${Date.now()}`.slice(0, 12);
    await profiles.create({ nit });
    const payload = registered({
      profile: { dpi: '2734519200901', phone: '55123489', nit, address: null },
    });

    await bus.deliver('UserRegistered', payload);

    expect(
      await prisma.clientProfile.findUniqueOrThrow({ where: { userId: payload.userId } }),
    ).toMatchObject({ nit: null });
  });

  it('keeps the settings versions and answers the one in force on a date', async () => {
    const older = randomUUID();
    const newer = randomUUID();
    versions.push(older, newer);
    const version = (versionId: string, effectiveFrom: string, rentalRatePerKm: number) => ({
      versionId,
      depreciationPerKm: 1.5,
      rentalRatePerKm,
      effectiveFrom,
      createdAt: new Date().toISOString(),
    });

    await bus.deliver('SettingsUpdated', version(older, '2098-01-01', 10));
    await bus.deliver('SettingsUpdated', version(newer, '2098-06-01', 12.5));

    const settings = app.get(SettingsCopyService);
    expect(await settings.effectiveOn('2098-03-15')).toMatchObject({ versionId: older });
    expect(await settings.effectiveOn('2098-07-01')).toMatchObject({
      versionId: newer,
      rentalRatePerKm: 12.5,
    });
  });
});
