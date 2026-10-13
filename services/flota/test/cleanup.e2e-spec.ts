import { randomUUID } from 'node:crypto';
import { testEmail } from '@debus/config/test-data';
import type { INestApplication } from '@nestjs/common';
import { GcsPhotoStorage, photoKeyFor } from '../src/photos/photo-storage';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './support/app';
import { seedTestBranch } from './support/branches';
import { cleanFleetTestData } from './support/cleanup';
import { uniquePlate } from './support/fleet';

describe('cleaning the test data of the fleet', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const storage = GcsPhotoStorage.fromEnv(process.env);
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await cleanFleetTestData(prisma);
    await app.close();
  });

  it('removes from the bucket the photos of the buses and drivers it deletes', async () => {
    const branchId = await seedTestBranch(prisma, 'limpieza de fotos');
    const busKey = photoKeyFor('buses', randomUUID());
    const driverKey = photoKeyFor('drivers', randomUUID());
    await storage.save(busKey, jpeg, 'image/jpeg');
    await storage.save(driverKey, jpeg, 'image/jpeg');
    await prisma.bus.create({
      data: {
        branchId,
        plate: uniquePlate(),
        brand: 'Volvo',
        model: 'B8R',
        year: 2021,
        capacity: 40,
        mileageKm: 1,
        photoKey: busKey,
      },
    });
    await prisma.driver.create({
      data: {
        branchId,
        fullName: 'Con Foto',
        email: testEmail('photo'),
        phone: '55551234',
        licenseNumber: `L${randomUUID().slice(0, 8).toUpperCase()}`,
        licenseType: 'A',
        licenseExpiresOn: new Date('2035-01-01'),
        baseSalary: 300,
        photoKey: driverKey,
      },
    });

    await cleanFleetTestData(prisma);

    expect(await storage.read(busKey)).toBeNull();
    expect(await storage.read(driverKey)).toBeNull();
    expect(await prisma.bus.count({ where: { branchId } })).toBe(0);
  });

  it('keeps the photos of rows that are not in a test branch of the run', async () => {
    const key = photoKeyFor('buses', randomUUID());
    await storage.save(key, jpeg, 'image/jpeg');

    await cleanFleetTestData(prisma);

    expect(await storage.read(key)).not.toBeNull();
    await storage.remove(key);
  });
});
