import { execFileSync } from 'node:child_process';
import { testSchema } from '@debus/config/test-data';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';

export interface IsolatedSchema {
  schema: string;
  /** A client whose ORM queries and raw SQL both go to the schema. */
  client: PrismaClient;
  /** Drops the schema and disconnects the client. */
  drop(): Promise<void>;
}

const databaseUrl = (schema?: string): string => {
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (schema) url.searchParams.set('schema', schema);
  return url.toString();
};

// The migrations create the schema and fill it.
export function migrateSchema(schema: string): void {
  execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: databaseUrl(schema) },
    stdio: 'pipe',
  });
}

export function schemaClient(schema: string): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg(
      { connectionString: databaseUrl(), options: `-c search_path=${schema}`, max: 5 },
      { schema },
    ),
  });
}

// The ORM names the schema in every query it generates, and the raw SQL of the service finds its
// tables through the search path: both must point at the throwaway schema, or a test meant to be
// isolated would change the shared one. The query reads no table, so a client that fails it stops
// the run before anything is written.
export async function assertCurrentSchema(client: PrismaClient, schema: string): Promise<void> {
  const current = await client.$queryRawUnsafe<{ name: string }[]>(
    'SELECT current_schema() AS name',
  );
  if (current[0]?.name !== schema) {
    throw new Error(`The raw SQL runs on the current schema ${current[0]?.name}, not on ${schema}`);
  }
}

// A migrated schema of its own, for tests that must never see or change what the local stack keeps
// in the shared one. A run that dies leaves it behind and `pnpm test:clean` drops it.
export async function isolatedSchema(label: string): Promise<IsolatedSchema> {
  const schema = testSchema(label);
  const client = schemaClient(schema);
  const drop = async () => {
    try {
      await client.$executeRawUnsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    } finally {
      await client.$disconnect();
    }
  };
  try {
    migrateSchema(schema);
    await assertCurrentSchema(client, schema);
  } catch (error) {
    await drop().catch(() => undefined);
    throw error;
  }
  return { schema, client, drop };
}
