#!/usr/bin/env node
// Scaffolds a NestJS service under services/<name>.
// Usage: node scripts/new-service.mjs <name> [--no-db] [--port <n>] [--update]
// --update rewrites the template files of an existing service and keeps its package.json dependencies.
// Dependency versions are copied from services/flota, so a new service pins them like the rest of the repo.
// It never overwrites the files a service customizes (module wiring, Prisma schema, env example, integration Jest config) and lists what it skipped.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [name, ...flags] = process.argv.slice(2);
if (!name || !/^[a-z][a-z0-9-]*$/.test(name)) {
  console.error(
    'Usage: node scripts/new-service.mjs <kebab-name> [--no-db] [--port <n>] [--update]',
  );
  process.exit(1);
}
const withDb = !flags.includes('--no-db');
const update = flags.includes('--update');
const portFlag = flags.indexOf('--port');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'services', name);
// A service whose schema is split into prisma/schema/ keeps the folder: the template points the
// config at it and never recreates the single prisma/schema.prisma.
const schemaFolder = existsSync(join(dir, 'prisma/schema'));
// An update keeps the port the service already uses unless --port says otherwise.
const currentPort = update
  ? /^PORT=(\d+)$/m.exec(readFileSync(join(dir, '.env.example'), 'utf8'))?.[1]
  : undefined;
const port = portFlag === -1 ? Number(currentPort ?? 3000) : Number(flags[portFlag + 1]);
if (existsSync(join(dir, 'package.json')) && !update) {
  console.error(`services/${name} already exists (use --update to refresh its template files)`);
  process.exit(1);
}

// What the generated code imports, by section. Versions come from the reference service's manifest.
const REFERENCE_SERVICE = 'flota';
const TEMPLATE_DEPENDENCIES = [
  '@debus/messaging',
  '@debus/server',
  '@nestjs/common',
  '@nestjs/config',
  '@nestjs/core',
  '@nestjs/platform-express',
  '@nestjs/swagger',
  'class-transformer',
  'class-validator',
  'nestjs-pino',
  'pino',
  'pino-http',
  'reflect-metadata',
  'rxjs',
  ...(withDb ? ['@debus/contracts', '@prisma/adapter-pg', '@prisma/client', 'dotenv', 'pg'] : []),
];
const TEMPLATE_DEV_DEPENDENCIES = [
  '@debus/config',
  '@nestjs/cli',
  '@nestjs/testing',
  '@types/supertest',
  'supertest',
  'typescript',
  ...(withDb ? ['prisma'] : []),
];

function versionsFrom(manifest, section, names) {
  return Object.fromEntries(
    [...names].sort().map((dependency) => {
      const version = manifest[section]?.[dependency];
      if (!version) {
        throw new Error(
          `${REFERENCE_SERVICE} does not declare ${dependency} in ${section}: update the template list`,
        );
      }
      return [dependency, version];
    }),
  );
}
const reference = JSON.parse(
  readFileSync(join(root, 'services', REFERENCE_SERVICE, 'package.json'), 'utf8'),
);
const dependencies = versionsFrom(reference, 'dependencies', TEMPLATE_DEPENDENCIES);
const devDependencies = versionsFrom(reference, 'devDependencies', TEMPLATE_DEV_DEPENDENCIES);

const integrationScript = `${withDb ? 'prisma migrate deploy && ' : ''}jest --config test/jest-integration.cjs --coverage`;

const files = {
  'package.json': JSON.stringify(
    {
      name: `@debus/${name}`,
      version: '0.0.0',
      private: true,
      scripts: {
        build: 'tsc -p tsconfig.build.json',
        dev: 'nest start --watch',
        start: 'node dist/main.js',
        lint: withDb
          ? 'eslint src test --max-warnings 0 && prisma format --check'
          : 'eslint src test --max-warnings 0',
        typecheck: 'tsc --noEmit',
        test: 'jest --coverage',
        'test:integration': integrationScript,
        ...(withDb && {
          'prisma:generate': 'prisma generate',
          'prisma:migrate': 'prisma migrate dev',
          'prisma:deploy': 'prisma migrate deploy',
        }),
      },
      dependencies,
      devDependencies,
    },
    null,
    2,
  ),
  'tsconfig.json': JSON.stringify(
    {
      extends: '@debus/config/tsconfig.node.json',
      compilerOptions: { outDir: 'dist', rootDir: '.', types: ['node', 'jest'] },
      include: ['src', 'test', ...(withDb ? ['prisma.config.ts'] : [])],
    },
    null,
    2,
  ),
  'tsconfig.build.json': JSON.stringify(
    {
      extends: './tsconfig.json',
      compilerOptions: { rootDir: 'src' },
      include: ['src'],
      exclude: ['src/**/*.spec.ts'],
    },
    null,
    2,
  ),
  'nest-cli.json': JSON.stringify(
    {
      $schema: 'https://json.schemastore.org/nest-cli',
      collection: '@nestjs/schematics',
      sourceRoot: 'src',
      compilerOptions: { tsConfigPath: 'tsconfig.build.json', deleteOutDir: true },
    },
    null,
    2,
  ),
  'jest.config.cjs': "module.exports = require('@debus/config/jest');\n",
  'test/jest-integration.cjs': "module.exports = require('@debus/config/jest-integration');\n",
  'eslint.config.mjs': "import config from '@debus/config/eslint';\n\nexport default config;\n",
  '.env.example': [
    `PORT=${port}`,
    `SERVICE_NAME=${name}`,
    'DEBUS_ENV=local',
    'PUBSUB_PROJECT_ID=debus-local',
    'PUBSUB_EMULATOR_HOST=localhost:8085',
    ...(withDb
      ? [`DATABASE_URL=postgresql://${name}:${name}@localhost:5432/${name}`, 'DB_POOL_MAX=5']
      : []),
    '',
  ].join('\n'),
  'src/main.ts': `import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableShutdownHooks();

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder().setTitle('${name}').setVersion('1.0').addBearerAuth().build(),
  );
  SwaggerModule.setup('docs', app, document);

  await app.listen(Number(process.env.PORT ?? ${port}));
}

void bootstrap();
`,
  'src/app.module.ts': `import { MessagingModule, ${withDb ? 'SqlInboxStore, ' : ''}httpLoggerOptions } from '@debus/messaging';
import { HttpExceptionFilter, RolesGuard } from '@debus/server';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { HealthModule } from './health/health.module';
${withDb ? "import { PrismaModule } from './prisma/prisma.module';\nimport { PrismaService } from './prisma/prisma.service';\n" : ''}
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({ pinoHttp: httpLoggerOptions() }),
    HealthModule,${
      withDb
        ? `
    PrismaModule,
    MessagingModule.forRoot({
      service: '${name}',
      inbox: {
        inject: [PrismaService],
        useFactory: (prisma: PrismaService) => new SqlInboxStore(prisma),
      },
      outbox: { inject: [PrismaService], useFactory: (prisma: PrismaService) => prisma },
    }),`
        : `
    MessagingModule.forRoot({ service: '${name}' }),`
    }
  ],
  providers: [
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}
`,
  'src/health/health.module.ts': `import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

@Module({ controllers: [HealthController] })
export class HealthModule {}
`,
  'src/health/health.controller.ts': `import { ServiceHttpClient } from '@debus/server';
import { Controller, Get, Optional } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

export interface HealthStatus {
  status: 'ok';
  service: string;
  circuits: ReturnType<ServiceHttpClient['circuits']>;
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  // Only a service that calls other services provides the client; the others report no circuits.
  constructor(@Optional() private readonly http?: ServiceHttpClient) {}

  @Get()
  @ApiOkResponse({ description: 'Service is up, with the state of its connections to other services' })
  check(): HealthStatus {
    return { status: 'ok', service: '${name}', circuits: this.http?.circuits() ?? [] };
  }
}
`,
  'src/health/health.controller.spec.ts': `import type { ServiceHttpClient } from '@debus/server';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('reports the service as up, with no circuits when it calls no other service', () => {
    const controller = new HealthController();

    const result = controller.check();

    expect(result).toEqual({ status: 'ok', service: '${name}', circuits: [] });
  });

  it('reports the circuits of the services it calls', () => {
    const circuits = [
      { target: 'flota', state: 'open', failures: 5, retryAt: '2026-10-19T10:32:05.000Z' },
    ];
    const http = { circuits: () => circuits } as unknown as ServiceHttpClient;

    const result = new HealthController(http).check();

    expect(result).toEqual({ status: 'ok', service: '${name}', circuits });
  });
});
`,
  'test/health.e2e-spec.ts': `import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('GET /health', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('responds 200 with the service status', async () => {
    const response = await request(app.getHttpServer()).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'ok',
      service: '${name}',
      circuits: expect.any(Array),
    });
  });

  it('answers unknown routes with the shared error shape and the correlation id', async () => {
    const response = await request(app.getHttpServer())
      .get('/nope')
      .set('x-correlation-id', 'c1')
      .expect(404);

    expect(response.body).toMatchObject({
      statusCode: 404,
      error: 'Not Found',
      correlationId: 'c1',
    });
  });
});
`,
};

if (withDb) {
  Object.assign(files, {
    'prisma.config.ts': `import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

// Same lookup as the integration tests: local .env first, then the committed defaults.
config({ path: ['.env', '.env.example'], quiet: true });

export default defineConfig({
  schema: '${schemaFolder ? 'prisma/schema' : 'prisma/schema.prisma'}',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DATABASE_URL ?? '' },
});
`,
    ...(!schemaFolder && {
      'prisma/schema.prisma': `generator client {
  provider     = "prisma-client"
  output       = "../src/generated/prisma"
  moduleFormat = "cjs"
}

datasource db {
  provider = "postgresql"
}

model ProcessedEvent {
  eventId     String   @id @map("event_id")
  type        String
  processedAt DateTime @default(now()) @map("processed_at") @db.Timestamptz(3)

  @@map("processed_events")
}

model OutboxEvent {
  eventId      String    @id @map("event_id")
  type         String
  envelope     Json
  createdAt    DateTime  @default(now()) @map("created_at") @db.Timestamptz(3)
  publishedAt  DateTime? @map("published_at") @db.Timestamptz(3)
  attempts     Int       @default(0)
  lastError    String?   @map("last_error")
  claimedUntil DateTime? @map("claimed_until") @db.Timestamptz(3)

  @@map("outbox")
}
`,
    }),
    'prisma/migrations/migration_lock.toml': 'provider = "postgresql"\n',
    'prisma/migrations/20261006000000_processed_events/migration.sql': `CREATE TABLE "processed_events" (
    "event_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "processed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_events_pkey" PRIMARY KEY ("event_id")
);
`,
    // Together the two outbox migrations build OUTBOX_TABLE_SQL from @debus/messaging. Prisma cannot model the partial index.
    'prisma/migrations/20261009000001_outbox/migration.sql': `CREATE TABLE "outbox" (
    "event_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "envelope" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,

    CONSTRAINT "outbox_pkey" PRIMARY KEY ("event_id")
);

CREATE INDEX "outbox_pending_idx" ON "outbox"("created_at") WHERE "published_at" IS NULL;
`,
    'prisma/migrations/20261009000002_outbox_claim/migration.sql': `ALTER TABLE "outbox" ADD COLUMN "claimed_until" TIMESTAMPTZ(3);
`,
    'src/prisma/prisma.module.ts': `import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
`,
    'src/prisma/prisma.service.ts': `import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

// Connects lazily on the first query, so the app boots without a reachable database.
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(config: ConfigService) {
    super({
      adapter: new PrismaPg({
        connectionString: config.getOrThrow<string>('DATABASE_URL'),
        max: Number(config.get<string>('DB_POOL_MAX', '5')),
      }),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
`,
    'src/prisma/prisma.service.spec.ts': `import { ConfigService } from '@nestjs/config';
import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  const config = new ConfigService({ DATABASE_URL: 'postgresql://user:pass@localhost:5432/db' });

  it('requires DATABASE_URL', () => {
    expect(() => new PrismaService(new ConfigService({}))).toThrow();
  });

  it('disconnects when the module is destroyed', async () => {
    const service = new PrismaService(config);
    const disconnect = jest.spyOn(service, '$disconnect').mockResolvedValue();

    await service.onModuleDestroy();

    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
`,
    'test/events.e2e-spec.ts': `import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import { createEnvelope, type EventEnvelope } from '@debus/contracts';
import { EventPublisher, Outbox } from '@debus/messaging';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { type IsolatedSchema, isolatedSchema } from './support/isolated-schema';

const push = (value: unknown) => ({
  message: { data: Buffer.from(JSON.stringify(value)).toString('base64'), messageId: '1' },
  subscription: 'test',
});

// Both groups work on a schema of their own: a flush claims every pending row of the outbox it
// sees, so on the shared schema it would also take (and mark as published) the rows that the local
// stack has not sent yet, and the stack would take the rows of the test.
let isolated: IsolatedSchema;

beforeAll(async () => {
  isolated = await isolatedSchema('events');
});

afterAll(async () => {
  await isolated.drop();
});

async function createApp(
  customize: (builder: TestingModuleBuilder) => TestingModuleBuilder = (builder) => builder,
): Promise<INestApplication> {
  const builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(isolated.client);
  const app = (await customize(builder).compile()).createNestApplication();
  await app.init();
  return app;
}

const currentSchemaOf = async (prisma: PrismaService): Promise<string | undefined> => {
  const rows = await prisma.$queryRawUnsafe<{ name: string }[]>('SELECT current_schema() AS name');
  return rows[0]?.name;
};

describe('Pub/Sub push endpoint', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('runs on a schema of its own', async () => {
    expect(await currentSchemaOf(app.get(PrismaService))).toBe(isolated.schema);
  });

  it('records a probe exactly once even when delivered twice', async () => {
    const envelope = createEnvelope('ProbeSent', { requestedAt: new Date().toISOString() }, 'c');
    const server = app.getHttpServer();

    await request(server).post('/events/pubsub').send(push(envelope)).expect(204);
    await request(server).post('/events/pubsub').send(push(envelope)).expect(204);

    const response = await request(server).get(\`/events/processed/\${envelope.eventId}\`).expect(200);
    expect(response.body).toMatchObject({ eventId: envelope.eventId, type: 'ProbeSent' });
    const stored = await app
      .get(PrismaService)
      .processedEvent.count({ where: { eventId: envelope.eventId } });
    expect(stored).toBe(1);
  });

  it('flushes the outbox on demand', async () => {
    const response = await request(app.getHttpServer()).post('/outbox/flush').expect(200);

    expect(response.body).toEqual({ published: expect.any(Number), failed: 0 });
  });

  it('answers 404 for events it never received', async () => {
    await request(app.getHttpServer()).get('/events/processed/never').expect(404);
  });

  it('answers 400 to a malformed push', async () => {
    await request(app.getHttpServer()).post('/events/pubsub').send({ message: {} }).expect(400);
  });
});

describe('Outbox with the service database client', () => {
  const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const published: string[] = [];
  let delayMs = 2500;
  let app: INestApplication;
  let prisma: PrismaService;

  beforeEach(async () => {
    published.length = 0;
    delayMs = 2500;
    await prisma.outboxEvent.deleteMany();
  });

  beforeAll(async () => {
    const publisher = {
      publish: async (envelope: EventEnvelope) => {
        await pause(delayMs);
        if (envelope.correlationId === 'rejected') throw new Error('pubsub unavailable');
        published.push(envelope.eventId);
        return 'message-id';
      },
    };
    app = await createApp((builder) =>
      builder.overrideProvider(EventPublisher).useValue(publisher),
    );
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('runs on a schema of its own', async () => {
    expect(await currentSchemaOf(prisma)).toBe(isolated.schema);
  });

  // Publishing takes longer than Prisma's interactive transaction timeout (5 s) in total.
  it('marks every event correctly when publishing is slow', async () => {
    const outbox = app.get(Outbox);
    const added = await prisma.$transaction(async (tx) => {
      const ids: string[] = [];
      for (const correlationId of ['first', 'second', 'rejected']) {
        ids.push(
          (
            await outbox.add(
              tx,
              'ProbeSent',
              { requestedAt: new Date().toISOString() },
              correlationId,
            )
          ).eventId,
        );
      }
      return ids;
    });

    const result = await outbox.flush();

    expect(result).toEqual({ published: 2, failed: 1 });
    expect([...published].sort()).toEqual(added.slice(0, 2).sort());
    const rows = await prisma.outboxEvent.findMany();
    const byCorrelation = (correlationId: string) =>
      rows.find(
        (row) => (row.envelope as { correlationId?: string }).correlationId === correlationId,
      );
    expect(byCorrelation('first')?.publishedAt).not.toBeNull();
    expect(byCorrelation('second')?.publishedAt).not.toBeNull();
    expect(byCorrelation('rejected')).toMatchObject({
      publishedAt: null,
      attempts: 1,
      lastError: 'pubsub unavailable',
    });
  }, 30000);

  it('releases the events it did not reach when the budget runs out', async () => {
    delayMs = 300;
    const outbox = app.get(Outbox);
    await prisma.$transaction(async (tx) => {
      for (const correlationId of ['first', 'second', 'third']) {
        await outbox.add(tx, 'ProbeSent', { requestedAt: new Date().toISOString() }, correlationId);
      }
    });

    const result = await outbox.flush({ budgetMs: 250 });

    expect(result).toEqual({ published: 0, failed: 1 });
    const rows = await prisma.outboxEvent.findMany();
    expect(rows.filter((row) => row.attempts === 1)).toHaveLength(1);
    expect(rows.filter((row) => row.attempts === 0 && row.claimedUntil === null)).toHaveLength(2);
  });
});
`,
    'test/support/isolated-schema.ts': `import { execFileSync } from 'node:child_process';
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
      { connectionString: databaseUrl(), options: \`-c search_path=\${schema}\`, max: 5 },
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
    throw new Error(\`The raw SQL runs on the current schema \${current[0]?.name}, not on \${schema}\`);
  }
}

// A migrated schema of its own, for tests that must never see or change what the local stack keeps
// in the shared one. A run that dies leaves it behind and \`pnpm test:clean\` drops it.
export async function isolatedSchema(label: string): Promise<IsolatedSchema> {
  const schema = testSchema(label);
  const client = schemaClient(schema);
  const drop = async () => {
    try {
      await client.$executeRawUnsafe(\`DROP SCHEMA IF EXISTS \${schema} CASCADE\`);
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
`,
  });
}

if (update) {
  const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  manifest.scripts['test:integration'] = integrationScript;
  // Template dependencies are added without touching the ones the service already has.
  manifest.dependencies = { ...dependencies, ...manifest.dependencies };
  manifest.devDependencies = { ...devDependencies, ...manifest.devDependencies };
  files['package.json'] = JSON.stringify(manifest, null, 2);
}

const CUSTOMIZED_FILES = [
  'src/app.module.ts',
  'prisma.config.ts',
  'prisma/schema.prisma',
  '.env.example',
  'test/jest-integration.cjs',
];
const skipped = [];

for (const [file, content] of Object.entries(files)) {
  const path = join(dir, file);
  if (update && CUSTOMIZED_FILES.includes(file) && existsSync(path)) {
    skipped.push(file);
    continue;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content.endsWith('\n') ? content : `${content}\n`);
}
console.log(`services/${name} ${update ? 'updated' : 'created'}${withDb ? '' : ' (no database)'}`);
if (skipped.length > 0) {
  console.log(
    `Skipped (the service may have customized them; merge by hand if needed): ${skipped.join(', ')}`,
  );
}
// The services are a closed list in the contracts: the module wiring is typed against it.
const topology = readFileSync(join(root, 'packages/contracts/src/topology.ts'), 'utf8');
if (!new RegExp(`BACKEND_SERVICES = \\[[^\\]]*'${name}'`).test(topology)) {
  console.warn(
    `${name} is not in BACKEND_SERVICES or LOCAL_PORTS (packages/contracts/src/topology.ts): add it there, or the service does not typecheck.`,
  );
}
