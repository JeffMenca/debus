import { testSchema } from '@debus/config/test-data';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { assertWritesTo, migrateSchema, schemaClient } from './support/isolated-app';

// The guard that keeps an isolated app away from the shared schema. A client that routes only the
// ORM to the throwaway schema, leaving the raw SQL on the default one, must be refused before it
// writes anything.
describe('isolated app guard', () => {
  const schema = testSchema('guard');
  const clients: PrismaClient[] = [];
  const track = (client: PrismaClient): PrismaClient => {
    clients.push(client);
    return client;
  };
  // The ORM names the schema, but the connection keeps the default search path.
  const ormOnlyClient = () => {
    const url = new URL(process.env.DATABASE_URL ?? '');
    url.searchParams.set('schema', schema);
    return track(
      new PrismaClient({
        adapter: new PrismaPg({ connectionString: url.toString(), max: 2 }, { schema }),
      }),
    );
  };

  beforeAll(() => {
    migrateSchema(schema);
  });

  afterAll(async () => {
    const [first] = clients;
    await first?.$executeRawUnsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await Promise.all(clients.map((client) => client.$disconnect()));
  });

  it('accepts a client that routes the ORM and the raw SQL to the schema', async () => {
    const client = track(schemaClient(schema));

    await expect(assertWritesTo(client, schema)).resolves.toBeUndefined();
  });

  it('refuses a client whose raw SQL would fall on the default schema, before writing anything', async () => {
    const client = ormOnlyClient();
    const create = jest.spyOn(client.user, 'create');

    await expect(assertWritesTo(client, schema)).rejects.toThrow(/current schema/i);

    expect(create).not.toHaveBeenCalled();
  });
});
