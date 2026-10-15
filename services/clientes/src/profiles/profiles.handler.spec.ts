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
const sqlClient = () => ({
  $executeRawUnsafe: jest.fn().mockResolvedValue(1),
  $queryRawUnsafe: jest.fn(),
});

describe('ProfilesHandler', () => {
  it('creates the profile and an empty wallet once, even if the event comes back', async () => {
    const tx = sqlClient();

    await new ProfilesHandler({} as never).registered(payload, envelope, tx);

    const [[profileSql, ...profileValues], [walletSql, walletUser]] =
      tx.$executeRawUnsafe.mock.calls;
    expect(profileSql).toContain('ON CONFLICT (user_id) DO NOTHING');
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

    await new ProfilesHandler({} as never).registered(payload, envelope, tx);

    expect(tx.$executeRawUnsafe.mock.calls[0][0]).toMatch(
      /CASE WHEN EXISTS \(SELECT 1 FROM client_profiles WHERE nit = \$7\) THEN NULL ELSE \$7 END/,
    );
  });

  it('falls back to the service client outside the inbox transaction', async () => {
    const prisma = sqlClient();

    await new ProfilesHandler(prisma as never).registered(payload, envelope);

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(2);
  });

  it('rejects a malformed payload before writing', async () => {
    const tx = sqlClient();

    await expect(
      new ProfilesHandler({} as never).registered({ userId: 'x' }, envelope, tx),
    ).rejects.toThrow();
    expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
  });
});
