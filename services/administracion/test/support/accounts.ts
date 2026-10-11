import { testEmail } from '@debus/config/test-data';
import type { AccountLinkSentPayload, UserRole } from '@debus/contracts';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { tokenOf } from './app';
import type { EventCapture } from './events';

// Creates the account straight in the database and activates it through its real emailed link.
export async function activeAccount(
  app: INestApplication,
  events: EventCapture,
  overrides: { role?: UserRole; branchId?: string | null; password?: string } = {},
): Promise<{ id: string; email: string; password: string }> {
  const email = testEmail(overrides.role?.toLowerCase() ?? 'client');
  const password = overrides.password ?? 'clave-segura-1';
  const role = overrides.role ?? 'CLIENT';
  const user = await app.get(PrismaService).user.create({
    data: {
      email,
      fullName: 'Persona de prueba',
      role,
      branchId: overrides.branchId ?? null,
      pendingProfile:
        role === 'CLIENT'
          ? { dpi: '2345678901234', phone: '55554444', nit: null, address: null }
          : undefined,
    },
  });
  await request(app.getHttpServer()).post('/auth/password/forgot').send({ email }).expect(202);
  const sent = await events.next<AccountLinkSentPayload>(
    'AccountLinkSent',
    (p) => p.email === email,
  );
  await request(app.getHttpServer())
    .post('/auth/password')
    .send({ token: tokenOf(sent.link!), password })
    .expect(204);
  return { id: user.id, email, password };
}
