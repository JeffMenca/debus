import { TEST_RUN } from '@debus/config/test-data';
import type { PrismaService } from '../src/prisma/prisma.service';

// Removes only what this test file created, so the local database does not pile up rows.
export async function cleanTestData(prisma: PrismaService): Promise<void> {
  const ofThisRun = { contains: `-${TEST_RUN}-` };
  await prisma.sentEmail.deleteMany({ where: { recipient: ofThisRun } });
  await prisma.ticketCopy.deleteMany({ where: { email: ofThisRun } });
  await prisma.driverLicense.deleteMany({ where: { email: ofThisRun } });
  await prisma.branchAdmin.deleteMany({ where: { email: ofThisRun } });
}
