import { InMemoryEventBus } from '@debus/messaging';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';

export interface ReportesTestApp {
  app: INestApplication;
  prisma: PrismaService;
  bus: InMemoryEventBus;
}

// reportes only consumes: events go through the real inbox and handlers by way of the in-memory bus.
export async function startReportes(
  customize: (builder: TestingModuleBuilder) => TestingModuleBuilder = (builder) => builder,
): Promise<ReportesTestApp> {
  const moduleRef = await customize(Test.createTestingModule({ imports: [AppModule] })).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return { app, prisma: app.get(PrismaService), bus: InMemoryEventBus.attach(app) };
}
