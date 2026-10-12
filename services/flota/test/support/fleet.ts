import { randomInt, randomUUID } from 'node:crypto';
import { testEmail } from '@debus/config/test-data';
import type { Prisma } from '../../src/generated/prisma/client';
import type { PrismaService } from '../../src/prisma/prisma.service';
import { seedTestBranch } from './branches';

const LETTERS = 'BCDFGHJKLMNPRSTVWXYZ';
const letters = (count: number) =>
  Array.from({ length: count }, () => LETTERS[randomInt(LETTERS.length)]).join('');

// Test plates start with Z (no real Guatemalan plate type uses it): 20^3 x 1000 combinations.
export const uniquePlate = (): string =>
  `Z${String(randomInt(1000)).padStart(3, '0')}${letters(3)}`;

export const uniqueLicense = (): string => `L${randomUUID().slice(0, 8).toUpperCase()}`;

// Rows written straight to the database, for the cases where the API must not see them.
export const busRow = (
  branchId: string,
  over: Partial<Prisma.BusUncheckedCreateInput> = {},
): Prisma.BusUncheckedCreateInput => ({
  branchId,
  plate: uniquePlate(),
  brand: 'Volvo',
  model: 'B8R',
  year: 2021,
  capacity: 40,
  mileageKm: 1000,
  ...over,
});

export const driverRow = (
  branchId: string,
  over: Partial<Prisma.DriverUncheckedCreateInput> = {},
): Prisma.DriverUncheckedCreateInput => ({
  branchId,
  fullName: 'Chofer de Prueba',
  email: testEmail('driver'),
  phone: '55551234',
  licenseNumber: uniqueLicense(),
  licenseType: 'A',
  licenseExpiresOn: new Date('2035-01-01'),
  baseSalary: 300,
  ...over,
});

// A bus, a driver and a route to another test branch, all in `branchId`: what a trip needs.
export async function seedBusDriverAndRoute(
  prisma: PrismaService,
  branchId: string,
): Promise<{ busId: string; driverId: string; routeId: string }> {
  const destinationBranchId = await seedTestBranch(prisma, 'destino');
  const driver = await prisma.driver.create({ data: driverRow(branchId) });
  const bus = await prisma.bus.create({ data: busRow(branchId) });
  const route = await prisma.route.create({
    data: { originBranchId: branchId, destinationBranchId, distanceKm: 100, ticketPrice: 50 },
  });
  return { busId: bus.id, driverId: driver.id, routeId: route.id };
}
