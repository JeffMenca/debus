import { execFileSync } from 'node:child_process';
import { testEmail, testSchema } from '@debus/config/test-data';
import type { INestApplication } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createTestApp } from './app';

export interface IsolatedApp {
  app: INestApplication;
  /** Drops the schema and closes the app. */
  dispose(): Promise<void>;
}

const databaseUrl = (schema?: string): string => {
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (schema) url.searchParams.set('schema', schema);
  return url.toString();
};

// The ORM names the schema in every query it generates, and the raw SQL of the service finds its
// tables through the search path: both must point at the throwaway schema, or a test meant to be
// isolated would change the shared one. The search path is checked first, with a query that reads
// no table, so a client that fails it stops the run before anything is written. Then a row written
// through the ORM must show up in the schema.
export async function assertWritesTo(client: PrismaClient, schema: string): Promise<void> {
  const current = await client.$queryRawUnsafe<{ name: string }[]>(
    'SELECT current_schema() AS name',
  );
  if (current[0]?.name !== schema) {
    throw new Error(`The raw SQL runs on the current schema ${current[0]?.name}, not on ${schema}`);
  }
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

// The migrations create the schema and fill it.
export function migrateSchema(schema: string): void {
  execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: databaseUrl(schema) },
    stdio: 'pipe',
  });
}

// A client whose ORM queries and raw SQL both go to the schema.
export function schemaClient(schema: string): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg(
      { connectionString: databaseUrl(), options: `-c search_path=${schema}`, max: 5 },
      { schema },
    ),
  });
}

// An app on a schema of its own, migrated like the real one. For tests that change what is global
// to the database (such as "the last system admin"), so they never touch the accounts that live in
// the shared schema. A run that dies leaves the schema behind and `pnpm test:clean` drops it.
export async function createIsolatedApp(label: string): Promise<IsolatedApp> {
  const schema = testSchema(label);
  migrateSchema(schema);
  const client = schemaClient(schema);
  const dropSchema = () => client.$executeRawUnsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  try {
    await assertWritesTo(client, schema);
    const app = await createTestApp((builder) =>
      builder.overrideProvider(PrismaService).useValue(client),
    );
    return {
      app,
      async dispose() {
        try {
          await dropSchema();
        } finally {
          await app.close();
          await client.$disconnect();
        }
      },
    };
  } catch (error) {
    await dropSchema().catch(() => undefined);
    await client.$disconnect();
    throw error;
  }
}
