import { createEnvelope, exampleSettingsUpdated } from '@debus/contracts';
import { SettingsHandler } from './settings.handler';

const setup = () => {
  const tx = { $executeRawUnsafe: jest.fn().mockResolvedValue(1), $queryRawUnsafe: jest.fn() };
  const prisma = { $executeRawUnsafe: jest.fn().mockResolvedValue(1) };
  return { tx, prisma, handler: new SettingsHandler(prisma as never) };
};
const envelope = createEnvelope('SettingsUpdated', {}, 'c');

describe('SettingsHandler', () => {
  it('keeps the depreciation rate of every settings version once', async () => {
    const { tx, handler } = setup();

    await handler.updated(exampleSettingsUpdated, envelope, tx);

    const [sql, ...values] = tx.$executeRawUnsafe.mock.calls[0] ?? [];
    expect(sql).toContain('INSERT INTO branch_report_depreciation_rates');
    expect(sql).toContain('ON CONFLICT (id) DO NOTHING');
    expect(values).toEqual([
      exampleSettingsUpdated.versionId,
      1.5,
      exampleSettingsUpdated.effectiveFrom,
      exampleSettingsUpdated.createdAt,
    ]);
  });

  it('rejects a malformed version without writing', async () => {
    const { tx, handler } = setup();

    await expect(handler.updated({ versionId: 'x' }, envelope, tx)).rejects.toThrow();
    expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('falls back to the service client outside the inbox transaction', async () => {
    const { prisma, handler } = setup();

    await handler.updated(exampleSettingsUpdated, envelope);

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(1);
  });
});
