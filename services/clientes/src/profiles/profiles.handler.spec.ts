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

const account = {
  userId: payload.userId,
  email: payload.email,
  fullName: payload.fullName,
  role: 'CASHIER',
  branchId: '3f2e1d0c-9b8a-4c7d-8e6f-5a4b3c2d1e0f',
  active: true,
  version: 2,
};
const updatedEnvelope = createEnvelope('UserUpdated', account, 'c');

describe('ProfilesHandler', () => {
  it('creates the profile and an empty wallet once, even if the event comes back', async () => {
    const tx = sqlClient();

    await handler().registered(payload, envelope, tx);

    const [[profileSql, ...profileValues]] = tx.$queryRawUnsafe.mock.calls;
    const [[walletSql, walletUser]] = tx.$executeRawUnsafe.mock.calls;
    expect(profileSql).toContain('ON CONFLICT (user_id) DO UPDATE');
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

  it('fills in the client fields a profile created earlier by a republished account lacks', async () => {
    const tx = sqlClient();

    await handler().registered(payload, envelope, tx);

    const sql = tx.$queryRawUnsafe.mock.calls[0][0];
    expect(sql).toMatch(/WHERE client_profiles\.dpi IS NULL AND EXCLUDED\.dpi IS NOT NULL/);
    expect(sql).toMatch(/COALESCE\(client_profiles\.phone, EXCLUDED\.phone\)/);
  });

  describe('updated', () => {
    it('recovers the profile and an empty wallet of an account that has none', async () => {
      const tx = sqlClient();

      await handler().updated(account, updatedEnvelope, tx);

      const [[profileSql, ...profileValues]] = tx.$queryRawUnsafe.mock.calls;
      const [[walletSql, walletUser]] = tx.$executeRawUnsafe.mock.calls;
      expect(profileSql).toContain('ON CONFLICT (user_id) DO NOTHING');
      expect(profileValues).toEqual([
        account.userId,
        account.email,
        account.fullName,
        'CASHIER',
        null,
        null,
        null,
        null,
      ]);
      expect(walletSql).toContain('ON CONFLICT (client_id) DO NOTHING');
      expect(walletUser).toBe(account.userId);
    });

    it('tells ventas about the recovered profile in the same transaction', async () => {
      const tx = sqlClient([{ nit: null, updated_at: created.updated_at }]);
      const queue = outbox();

      await handler({}, queue).updated(account, updatedEnvelope, tx);

      expect(queue.add).toHaveBeenCalledWith(
        tx,
        'ProfileUpdated',
        {
          clientId: account.userId,
          nit: null,
          fullName: 'Ana Méndez',
          updatedAt: '2026-10-18T15:30:00.000Z',
        },
        updatedEnvelope.correlationId,
      );
    });

    it('announces nothing when the profile already existed', async () => {
      const tx = sqlClient([]);
      const queue = outbox();

      await handler({}, queue).updated(account, updatedEnvelope, tx);

      expect(queue.add).not.toHaveBeenCalled();
    });

    it('keeps the name, the email and the state of the account, only from a newer version', async () => {
      const tx = sqlClient([]);
      const change = { ...account, fullName: 'Ana Ruiz', email: 'ana@b.com', active: false };

      await handler().updated(change, updatedEnvelope, tx);

      const [sql, ...values] = tx.$executeRawUnsafe.mock.calls.find(([text]) =>
        String(text).includes('UPDATE client_profiles'),
      ) as unknown[];
      expect(sql).toContain('account_version < $5');
      expect(values).toEqual([account.userId, 'ana@b.com', 'Ana Ruiz', false, account.version]);
    });

    it('creates no profile for a deactivated account, and only marks one that exists', async () => {
      const tx = sqlClient();
      const queue = outbox();

      await handler({}, queue).updated({ ...account, active: false }, updatedEnvelope, tx);

      expect(tx.$queryRawUnsafe).not.toHaveBeenCalled();
      expect(tx.$executeRawUnsafe).toHaveBeenCalledTimes(1);
      expect(tx.$executeRawUnsafe.mock.calls[0]?.[0]).toContain('UPDATE client_profiles');
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('falls back to the service client outside the inbox transaction', async () => {
      const prisma = sqlClient();

      await handler(prisma).updated(account, updatedEnvelope);

      expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(1);
    });

    it('rejects a malformed payload before writing', async () => {
      const tx = sqlClient();

      await expect(handler().updated({ userId: 'x' }, updatedEnvelope, tx)).rejects.toThrow();
      expect(tx.$queryRawUnsafe).not.toHaveBeenCalled();
    });
  });
});
