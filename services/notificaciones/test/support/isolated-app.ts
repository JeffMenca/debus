import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import type { IsolatedSchema } from './isolated-schema';

// The whole service on a schema of its own: flushing the queue there never takes (or sends) the
// pending emails of the local stack, and the stack never sends the ones of the test.
export async function createIsolatedApp(isolated: IsolatedSchema): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(isolated.client)
    .compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}
