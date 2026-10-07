#!/usr/bin/env node
// Scaffolds a NestJS service under services/<name>.
// Usage: node scripts/new-service.mjs <name> [--no-db] [--port <n>] [--update]
// --update rewrites the template files of an existing service and keeps its package.json dependencies.
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
const port = portFlag === -1 ? 3000 : Number(flags[portFlag + 1]);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'services', name);
if (existsSync(join(dir, 'package.json')) && !update) {
  console.error(`services/${name} already exists (use --update to refresh its template files)`);
  process.exit(1);
}
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
        lint: 'eslint src test',
        typecheck: 'tsc --noEmit',
        test: 'jest --coverage',
        'test:integration': integrationScript,
        ...(withDb && {
          'prisma:generate': 'prisma generate',
          'prisma:migrate': 'prisma migrate dev',
          'prisma:deploy': 'prisma migrate deploy',
        }),
      },
      dependencies: {},
      devDependencies: { '@debus/config': 'workspace:*', typescript: '^5.9.3' },
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
  'src/app.module.ts': `import { MessagingModule, ${withDb ? 'SqlInboxStore, ' : ''}correlationIdFor } from '@debus/messaging';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { HealthModule } from './health/health.module';
${withDb ? "import { PrismaModule } from './prisma/prisma.module';\nimport { PrismaService } from './prisma/prisma.service';\n" : ''}
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({
      pinoHttp: { level: process.env.LOG_LEVEL ?? 'info', genReqId: correlationIdFor },
    }),
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
    }),`
        : `
    MessagingModule.forRoot({ service: '${name}' }),`
    }
  ],
})
export class AppModule {}
`,
  'src/health/health.module.ts': `import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

@Module({ controllers: [HealthController] })
export class HealthModule {}
`,
  'src/health/health.controller.ts': `import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

export interface HealthStatus {
  status: 'ok';
  service: string;
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOkResponse({ description: 'Service is up' })
  check(): HealthStatus {
    return { status: 'ok', service: '${name}' };
  }
}
`,
  'src/health/health.controller.spec.ts': `import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('reports the service as up', () => {
    const controller = new HealthController();

    const result = controller.check();

    expect(result).toEqual({ status: 'ok', service: '${name}' });
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
    expect(response.body).toEqual({ status: 'ok', service: '${name}' });
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
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DATABASE_URL ?? '' },
});
`,
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
`,
    'prisma/migrations/migration_lock.toml': 'provider = "postgresql"\n',
    'prisma/migrations/20261006000000_processed_events/migration.sql': `CREATE TABLE "processed_events" (
    "event_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "processed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_events_pkey" PRIMARY KEY ("event_id")
);
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
import { Test } from '@nestjs/testing';
import { createEnvelope } from '@debus/contracts';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const push = (value: unknown) => ({
  message: { data: Buffer.from(JSON.stringify(value)).toString('base64'), messageId: '1' },
  subscription: 'test',
});

describe('Pub/Sub push endpoint', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('records a probe exactly once even when delivered twice', async () => {
    const envelope = createEnvelope('SondeoEmitido', { requestedAt: new Date().toISOString() }, 'c');
    const server = app.getHttpServer();

    await request(server).post('/events/pubsub').send(push(envelope)).expect(204);
    await request(server).post('/events/pubsub').send(push(envelope)).expect(204);

    const response = await request(server).get(\`/events/processed/\${envelope.eventId}\`).expect(200);
    expect(response.body).toMatchObject({ eventId: envelope.eventId, type: 'SondeoEmitido' });
    const stored = await app
      .get(PrismaService)
      .processedEvent.count({ where: { eventId: envelope.eventId } });
    expect(stored).toBe(1);
  });

  it('answers 404 for events it never received', async () => {
    await request(app.getHttpServer()).get('/events/processed/never').expect(404);
  });

  it('answers 400 to a malformed push', async () => {
    await request(app.getHttpServer()).post('/events/pubsub').send({ message: {} }).expect(400);
  });
});
`,
  });
}

if (update) {
  const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  manifest.scripts['test:integration'] = integrationScript;
  files['package.json'] = JSON.stringify(manifest, null, 2);
}

for (const [file, content] of Object.entries(files)) {
  const path = join(dir, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content.endsWith('\n') ? content : `${content}\n`);
}
console.log(`services/${name} ${update ? 'updated' : 'created'}${withDb ? '' : ' (no database)'}`);
