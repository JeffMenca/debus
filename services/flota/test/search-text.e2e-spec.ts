import { randomUUID } from 'node:crypto';
import { testEmail } from '@debus/config/test-data';
import { createEnvelope, foldSearchText } from '@debus/contracts';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './support/app';
import { seedTestBranch } from './support/branches';
import { cleanFleetTestData } from './support/cleanup';
import { uniquePlate } from './support/fleet';

const push = (value: unknown) => ({
  message: { data: Buffer.from(JSON.stringify(value)).toString('base64'), messageId: '1' },
  subscription: 'test',
});

describe('search_text of the fleet', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let branchId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    branchId = await seedTestBranch(prisma, 'texto de busqueda');
  });
  afterAll(async () => {
    await cleanFleetTestData(prisma);
    await app.close();
  });

  it('folds every Latin-1 and Latin Extended-A letter the same way as the application', async () => {
    const letters = Array.from({ length: 0x180 - 0x20 }, (_, i) => String.fromCodePoint(0x20 + i));
    const sample = `x ${letters.join(' ')} x`;

    const [row] = await prisma.$queryRaw<{ folded: string }[]>`
      SELECT fold_search_text(${sample}) AS folded`;

    expect(row?.folded).toBe(foldSearchText(sample));
  });

  it('finds a bus and a driver by what a person types, accents or not', async () => {
    const bus = await prisma.bus.create({
      data: {
        branchId,
        plate: uniquePlate(),
        brand: 'Citroën',
        model: 'Jumper',
        year: 2020,
        capacity: 20,
        mileageKm: 1,
      },
    });
    const driver = await prisma.driver.create({
      data: {
        branchId,
        fullName: 'François Ågård',
        email: testEmail('francois'),
        phone: '55551234',
        licenseNumber: `L${randomUUID().slice(0, 8).toUpperCase()}`,
        licenseType: 'A',
        licenseExpiresOn: new Date('2035-01-01'),
        baseSalary: 300,
      },
    });

    expect(bus.searchText).toContain(foldSearchText('Citroën'));
    expect(driver.searchText).toContain(foldSearchText('François Ågård'));
  });

  it('keeps the search text of a route in step with the name of its destination branch', async () => {
    const destinationId = await seedTestBranch(prisma, 'destino viejo');
    const route = await prisma.route.create({
      data: {
        originBranchId: branchId,
        destinationBranchId: destinationId,
        distanceKm: 10,
        ticketPrice: 5,
      },
    });
    expect(route.searchText).toContain('destino viejo');

    const renamed = {
      branchId: destinationId,
      code: 'NUE',
      name: `Prueba renombrada ${randomUUID().slice(0, 8)} Petén`,
      department: 'Petén',
      municipality: 'Flores',
      address: 'Calle 1',
      phone: '77612233',
      latitude: 14.8,
      longitude: -91.5,
      active: true,
      version: 2,
    };
    await request(app.getHttpServer())
      .post('/events/pubsub')
      .send(push(createEnvelope('BranchUpdated', renamed, 'c')))
      .expect(204);

    const after = await prisma.route.findUniqueOrThrow({ where: { id: route.id } });
    expect(after.searchText).toBe(foldSearchText(`${renamed.name} ${renamed.code}`));
    expect(after.searchText).not.toContain('viejo');
  });
});
