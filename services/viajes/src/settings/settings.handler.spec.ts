import { createEnvelope } from '@debus/contracts';
import { SettingsHandler } from './settings.handler';

const payload = {
  versionId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  depreciationPerKm: 1.25,
  rentalRatePerKm: 12,
  effectiveFrom: '2026-10-10',
  createdAt: '2026-10-10T15:00:00.000Z',
};

describe('SettingsHandler', () => {
  it('stores each version once, since versions never change', async () => {
    const tx = { $executeRawUnsafe: jest.fn().mockResolvedValue(1), $queryRawUnsafe: jest.fn() };
    const handler = new SettingsHandler({} as never);

    await handler.updated(payload, createEnvelope('SettingsUpdated', payload, 'c'), tx);

    const [sql, ...values] = tx.$executeRawUnsafe.mock.calls[0];
    expect(sql).toContain('ON CONFLICT (id) DO NOTHING');
    expect(values).toEqual([payload.versionId, 1.25, 12, '2026-10-10', '2026-10-10T15:00:00.000Z']);
  });

  it('falls back to the service client outside the inbox transaction', async () => {
    const prisma = { $executeRawUnsafe: jest.fn().mockResolvedValue(1) };

    await new SettingsHandler(prisma as never).updated(
      payload,
      createEnvelope('SettingsUpdated', payload, 'c'),
    );

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(1);
  });

  it('rejects a malformed payload', async () => {
    const tx = { $executeRawUnsafe: jest.fn(), $queryRawUnsafe: jest.fn() };

    await expect(
      new SettingsHandler({} as never).updated(
        { versionId: 'x' },
        createEnvelope('SettingsUpdated', {}, 'c'),
        tx,
      ),
    ).rejects.toThrow();
    expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
  });
});
