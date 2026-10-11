import { randomUUID } from 'node:crypto';
import { createEnvelope } from '@debus/contracts';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { BranchesHandler } from '../src/branches/branches.handler';
import { PrismaService } from '../src/prisma/prisma.service';

const push = (value: unknown) => ({
  message: { data: Buffer.from(JSON.stringify(value)).toString('base64'), messageId: '1' },
  subscription: 'test',
});

const snapshot = (branchId: string, version: number, name: string, active = true) => ({
  branchId,
  code: 'XEL',
  name,
  department: 'Quetzaltenango',
  municipality: 'Quetzaltenango',
  address: '4a calle 12-30 zona 1',
  phone: '77612233',
  latitude: 14.8347,
  longitude: -91.5181,
  active,
  version,
});

describe('branch copies', () => {
  const created: string[] = [];
  let app: INestApplication;
  let prisma: PrismaService;

  const newBranchId = () => {
    const id = randomUUID();
    created.push(id);
    return id;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    try {
      await prisma.$executeRawUnsafe('DELETE FROM branches WHERE id = ANY($1::uuid[])', created);
    } finally {
      await app.close();
    }
  });

  it('stores a branch once even when the event arrives twice', async () => {
    const server = app.getHttpServer();
    const branchId = newBranchId();
    const envelope = createEnvelope('BranchCreated', snapshot(branchId, 1, 'Quetzaltenango'), 'c');

    await request(server).post('/events/pubsub').send(push(envelope)).expect(204);
    await request(server).post('/events/pubsub').send(push(envelope)).expect(204);

    expect(await prisma.branchCopy.findMany({ where: { id: branchId } })).toEqual([
      expect.objectContaining({ name: 'Quetzaltenango', version: 1, active: true }),
    ]);
  });

  it('keeps the newest version when events arrive out of order', async () => {
    const server = app.getHttpServer();
    const branchId = newBranchId();
    const send = (
      type: 'BranchCreated' | 'BranchUpdated',
      version: number,
      name: string,
      active = true,
    ) =>
      request(server)
        .post('/events/pubsub')
        .send(push(createEnvelope(type, snapshot(branchId, version, name, active), 'c')))
        .expect(204);

    await send('BranchUpdated', 3, 'Xela inactiva', false);
    await send('BranchUpdated', 2, 'Xela vieja');
    await send('BranchCreated', 1, 'Xela original');

    expect(await prisma.branchCopy.findUnique({ where: { id: branchId } })).toMatchObject({
      version: 3,
      name: 'Xela inactiva',
      active: false,
    });
  });

  it('also stores a branch when the handler runs outside the inbox transaction', async () => {
    const branchId = newBranchId();
    const payload = snapshot(branchId, 1, 'Fuera del inbox');

    await app.get(BranchesHandler).created(payload, createEnvelope('BranchCreated', payload, 'c'));

    expect(await prisma.branchCopy.findUnique({ where: { id: branchId } })).toMatchObject({
      name: 'Fuera del inbox',
    });
  });
});
