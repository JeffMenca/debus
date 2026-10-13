import { TEST_RUN } from '@debus/config/test-data';
import { cleanupStatements, photoKeysQuery } from '@debus/config/test-data-sql';
import { GcsPhotoStorage } from '../../src/photos/photo-storage';
import type { PrismaService } from '../../src/prisma/prisma.service';

// The photos live in the bucket, not in the database, so they go first: once the rows are deleted
// nothing says which objects belonged to the test.
export async function cleanFleetTestData(prisma: PrismaService): Promise<void> {
  const storage = GcsPhotoStorage.fromEnv(process.env);
  const rows = await prisma.$queryRawUnsafe<{ photo_key: string }[]>(photoKeysQuery(TEST_RUN));
  for (const { photo_key } of rows) await storage.remove(photo_key);
  for (const statement of cleanupStatements({ run: TEST_RUN })) {
    await prisma.$executeRawUnsafe(statement);
  }
}
