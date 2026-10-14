import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ensureTopic } from '@debus/messaging';
import { AppModule } from '../../src/app.module';

export async function createTestApp(): Promise<INestApplication> {
  await ensureTopic('flota');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}
