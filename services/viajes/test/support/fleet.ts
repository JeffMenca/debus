import { randomUUID } from 'node:crypto';
import type { PrismaService } from '../../src/prisma/prisma.service';
import { seedTestBranch } from './branches';

export interface SeededFleet {
  branchId: string;
  destinationId: string;
  busId: string;
  driverId: string;
  routeId: string;
}

const letters = () =>
  randomUUID()
    .replace(/[^a-f]/g, '')
    .slice(0, 3)
    .toUpperCase()
    .padEnd(3, 'B');

// The copies of a bus, a driver and a route that flota would have sent, for the branch `branchId`.
export async function seedBus(prisma: PrismaService, branchId: string): Promise<string> {
  const id = randomUUID();
  await prisma.busCopy.create({
    data: {
      id,
      branchId,
      plate: `Z${Math.floor(Math.random() * 900 + 100)}${letters()}`,
      capacity: 40,
      operationalStatus: 'AVAILABLE',
      active: true,
      mileageKm: 1000,
      version: 1,
    },
  });
  return id;
}

export async function seedDriver(prisma: PrismaService, branchId: string): Promise<string> {
  const id = randomUUID();
  await prisma.driverCopy.create({
    data: {
      id,
      branchId,
      fullName: 'Chofer de Prueba',
      licenseExpiresOn: new Date('2040-01-01'),
      baseSalary: 300,
      active: true,
      version: 1,
    },
  });
  return id;
}

export async function seedFleet(prisma: PrismaService, label: string): Promise<SeededFleet> {
  const branchId = await seedTestBranch(prisma, label);
  const destinationId = await seedTestBranch(prisma, `${label} destino`);
  const routeId = randomUUID();
  await prisma.routeCopy.create({
    data: {
      id: routeId,
      originBranchId: branchId,
      destinationBranchId: destinationId,
      distanceKm: 100,
      ticketPrice: 85,
      active: true,
      version: 1,
    },
  });
  return {
    branchId,
    destinationId,
    routeId,
    busId: await seedBus(prisma, branchId),
    driverId: await seedDriver(prisma, branchId),
  };
}
