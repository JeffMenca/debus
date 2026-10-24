import { randomUUID } from 'node:crypto';
import { identityHeaders } from '@debus/server';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

export const systemAdminHeaders = () => identityHeaders(randomUUID(), 'SYSTEM_ADMIN');

// A GET as the system administrator; call .buffer() through getPdf for a PDF.
export const getAsSystemAdmin = (app: INestApplication, path: string) =>
  request(app.getHttpServer()).get(path).set(systemAdminHeaders());

export const getPdfAsSystemAdmin = (app: INestApplication, path: string) =>
  getAsSystemAdmin(app, path)
    .buffer(true)
    .parse((res, done) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => done(null, Buffer.concat(chunks)));
    });

// The roles that must never reach a system report.
export const expectOnlySystemAdmin = async (app: INestApplication, paths: string[]) => {
  const branchId = randomUUID();
  for (const path of paths) {
    for (const role of ['BRANCH_ADMIN', 'CASHIER'] as const) {
      await request(app.getHttpServer())
        .get(path)
        .set(identityHeaders(randomUUID(), role, branchId))
        .expect(403);
    }
    await request(app.getHttpServer()).get(path).expect(401);
  }
};
