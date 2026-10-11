import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';

export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

// Jest gives every test file its own module registry, so each file marks the rows it creates.
export const TEST_RUN = randomUUID().slice(0, 8);

export const uniqueEmail = (label: string): string =>
  `${label}-${TEST_RUN}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@correo.com`;

export const tokenOf = (link: string): string => new URL(link).searchParams.get('token') ?? '';
