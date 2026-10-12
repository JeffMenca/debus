import { randomUUID } from 'node:crypto';
import { createEnvelope } from '@debus/contracts';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SettingsHandler } from '../src/settings/settings.handler';
import { SettingsCopyService } from '../src/settings/settings-copy.service';

const push = (value: unknown) => ({
  message: { data: Buffer.from(JSON.stringify(value)).toString('base64'), messageId: '1' },
  subscription: 'test',
});

describe('settings copies', () => {
  const versionIds = [randomUUID(), randomUUID(), randomUUID()];
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    try {
      // The copy has no immutability trigger: the immutable history lives in administracion.
      await prisma.settingsVersionCopy.deleteMany({ where: { id: { in: versionIds } } });
    } finally {
      await app.close();
    }
  });

  it('answers the rates in force on a date from the versions received by event', async () => {
    const server = app.getHttpServer();
    const send = (
      versionId: string,
      depreciationPerKm: number,
      effectiveFrom: string,
      createdAt: string,
    ) =>
      request(server)
        .post('/events/pubsub')
        .send(
          push(
            createEnvelope(
              'SettingsUpdated',
              { versionId, depreciationPerKm, rentalRatePerKm: 12, effectiveFrom, createdAt },
              'c',
            ),
          ),
        )
        .expect(204);
    const [a, b, c] = versionIds as [string, string, string];

    // Dates in 2031 do not collide with versions other runs may have stored.
    await send(a, 1.0, '2031-01-01', '2030-12-01T10:00:00.000Z');
    await send(b, 1.5, '2031-02-01', '2030-12-02T10:00:00.000Z');
    await send(c, 1.75, '2031-02-01', '2030-12-03T10:00:00.000Z');
    await send(c, 1.75, '2031-02-01', '2030-12-03T10:00:00.000Z');

    const copies = app.get(SettingsCopyService);
    expect((await copies.effectiveOn('2031-01-15'))?.versionId).toBe(a);
    expect(await copies.effectiveOn('2031-02-10')).toMatchObject({
      versionId: c,
      depreciationPerKm: 1.75,
    });
    expect(await prisma.settingsVersionCopy.count({ where: { id: c } })).toBe(1);
  });

  it('also stores a version when the handler runs outside the inbox transaction', async () => {
    const versionId = randomUUID();
    versionIds.push(versionId);
    const payload = {
      versionId,
      depreciationPerKm: 1.1,
      rentalRatePerKm: 11,
      effectiveFrom: '2031-03-01',
      createdAt: '2030-12-04T10:00:00.000Z',
    };

    await app
      .get(SettingsHandler)
      .updated(payload, createEnvelope('SettingsUpdated', payload, 'c'));

    expect(await prisma.settingsVersionCopy.count({ where: { id: versionId } })).toBe(1);
  });
});
