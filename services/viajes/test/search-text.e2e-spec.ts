import { randomUUID } from 'node:crypto';
import { foldSearchText } from '@debus/contracts';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './support/app';
import { seedTestBranch } from './support/branches';
import { cleanTripTestData } from './support/cleanup';

describe('search_text of the trips', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let branchId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    branchId = await seedTestBranch(prisma, 'texto de busqueda de viajes');
  });
  afterAll(async () => {
    await cleanTripTestData(prisma);
    await app.close();
  });

  it('folds every Latin-1 and Latin Extended-A letter the same way as the application', async () => {
    const letters = Array.from({ length: 0x180 - 0x20 }, (_, i) => String.fromCodePoint(0x20 + i));
    const sample = `x ${letters.join(' ')} x`;

    const [row] = await prisma.$queryRaw<{ folded: string }[]>`
      SELECT fold_search_text(${sample}) AS folded`;

    expect(row?.folded).toBe(foldSearchText(sample));
  });

  it('finds a trip by a driver or a place written with letters from outside Spanish', async () => {
    const trip = await prisma.trip.create({
      data: {
        type: 'REGULAR',
        status: 'SCHEDULED',
        branchId,
        busId: randomUUID(),
        busPlate: 'Z321ABC',
        capacity: 40,
        driverId: randomUUID(),
        driverName: 'François Ågård',
        originLabel: 'Agnès',
        destinationLabel: 'Petén',
        departureAt: new Date('2031-01-10T12:00:00Z'),
        estimatedArrivalAt: new Date('2031-01-10T16:00:00Z'),
        ticketPrice: 85,
        createdById: randomUUID(),
      },
    });

    expect(trip.searchText).toContain(foldSearchText('François Ågård'));
    expect(trip.searchText).toContain(foldSearchText('Agnès'));
  });
});
