import { testEmail } from '@debus/config/test-data';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '../../src/generated/prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createTestApp } from './app';
import { assertCurrentSchema, isolatedSchema } from './isolated-schema';

export interface IsolatedApp {
  app: INestApplication;
  /** Drops the schema and closes the app. */
  dispose(): Promise<void>;
}

// A row written through the ORM must show up in the schema, after the search path is checked.
export async function assertWritesTo(client: PrismaClient, schema: string): Promise<void> {
  await assertCurrentSchema(client, schema);
  const email = testEmail('schema-check');
  await client.user.create({ data: { email, fullName: 'Schema check', role: 'CLIENT' } });
  try {
    const rows = await client.$queryRawUnsafe<{ found: number }[]>(
      `SELECT count(*)::int AS found FROM "${schema}".users WHERE email = $1`,
      email,
    );
    if (rows[0]?.found !== 1) throw new Error(`The test client does not write to ${schema}`);
  } finally {
    await client.user.deleteMany({ where: { email } });
  }
}

// An app on a schema of its own, migrated like the real one. For tests that change what is global
// to the database (such as "the last system admin"), so they never touch the accounts that live in
// the shared schema. A run that dies leaves the schema behind and `pnpm test:clean` drops it.
export async function createIsolatedApp(label: string): Promise<IsolatedApp> {
  const isolated = await isolatedSchema(label);
  try {
    await assertWritesTo(isolated.client, isolated.schema);
    const app = await createTestApp((builder) =>
      builder.overrideProvider(PrismaService).useValue(isolated.client),
    );
    return {
      app,
      async dispose() {
        try {
          await isolated.drop();
        } finally {
          await app.close();
        }
      },
    };
  } catch (error) {
    await isolated.drop().catch(() => undefined);
    throw error;
  }
}
