import { createEnvelope } from '@debus/contracts';
import { ProfilesHandler } from './profiles.handler';

const payload = {
  userId: '7d6c5b4a-3f2e-4d1c-8b0a-9f8e7d6c5b4a',
  email: 'ana@correo.com',
  fullName: 'Ana Méndez',
  role: 'CLIENT',
  branchId: null,
  profile: { dpi: '2734519200901', phone: '55123489', nit: '45218376', address: 'Zona 3' },
};
const envelope = createEnvelope('UserRegistered', payload, 'c');
const created = { nit: '45218376', updated_at: new Date('2026-10-18T15:30:00.000Z') };
const sqlClient = (inserted: unknown[] = [created]) => ({
  $executeRawUnsafe: jest.fn().mockResolvedValue(1),
  $queryRawUnsafe: jest.fn().mockResolvedValue(inserted),
});
const outbox = () => ({ add: jest.fn().mockResolvedValue({}) });
const handler = (prisma: unknown = {}, queue = outbox()) =>
  new ProfilesHandler(prisma as never, queue as never);

describe('ProfilesHandler', () => {
  it('creates the profile and an empty wallet once, even if the event comes back', async () => {
    const tx = sqlClient();

    await handler().registered(payload, envelope, tx);

    const [[profileSql, ...profileValues]] = tx.$queryRawUnsafe.mock.calls;
    const [[walletSql, walletUser]] = tx.$executeRawUnsafe.mock.calls;
    expect(profileSql).toContain('ON CONFLICT (user_id) DO NOTHING');
    expect(profileSql).toContain('RETURNING nit, updated_at');
    expect(profileValues).toEqual([
      payload.userId,
      payload.email,
      payload.fullName,
      'CLIENT',
      '2734519200901',
      '55123489',
      '45218376',
      'Zona 3',
    ]);
    expect(walletSql).toContain('ON CONFLICT (client_id) DO NOTHING');
    expect(walletUser).toBe(payload.userId);
  });

  it('drops a NIT another profile already holds, like the registration does', async () => {
    const tx = sqlClient();

    await handler().registered(payload, envelope, tx);

    expect(tx.$queryRawUnsafe.mock.calls[0][0]).toMatch(
      /CASE WHEN EXISTS \(SELECT 1 FROM client_profiles WHERE nit = \$7\) THEN NULL ELSE \$7 END/,
    );
  });

  it('tells ventas the NIT that was kept, in the same transaction as the new profile', async () => {
    const tx = sqlClient([{ nit: null, updated_at: created.updated_at }]);
    const queue = outbox();

    await handler({}, queue).registered(payload, envelope, tx);

    expect(queue.add).toHaveBeenCalledWith(
      tx,
      'ProfileUpdated',
      {
        clientId: payload.userId,
        nit: null,
        fullName: 'Ana Méndez',
        updatedAt: '2026-10-18T15:30:00.000Z',
      },
      envelope.correlationId,
    );
  });

  it('announces nothing when the profile already existed', async () => {
    const tx = sqlClient([]);
    const queue = outbox();

    await handler({}, queue).registered(payload, envelope, tx);

    expect(queue.add).not.toHaveBeenCalled();
    expect(tx.$executeRawUnsafe).toHaveBeenCalledTimes(1);
  });

  it('falls back to the service client outside the inbox transaction', async () => {
    const prisma = sqlClient();
    const queue = outbox();

    await handler(prisma, queue).registered(payload, envelope);

    expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(1);
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(1);
    expect(queue.add.mock.calls[0][0]).toBe(prisma);
  });

  it('rejects a malformed payload before writing', async () => {
    const tx = sqlClient();

    await expect(handler().registered({ userId: 'x' }, envelope, tx)).rejects.toThrow();
    expect(tx.$queryRawUnsafe).not.toHaveBeenCalled();
  });
});
