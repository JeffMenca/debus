import { SettingsRepublishService } from './settings-republish.service';

const version = (id: string) => ({
  id,
  depreciationPerKm: { toNumber: () => 1.25 },
  rentalRatePerKm: { toNumber: () => 12 },
  effectiveFrom: new Date('2026-10-10T00:00:00.000Z'),
  createdAt: new Date('2026-10-10T15:00:00.000Z'),
});

function setup(pages: string[][]) {
  const tx = {
    settingsVersion: {
      findUniqueOrThrow: jest.fn(({ where }) => Promise.resolve(version(where.id))),
      update: jest.fn(),
    },
  };
  const prisma = {
    settingsVersion: { findMany: jest.fn() },
    $transaction: jest.fn((work) => work(tx)),
  };
  for (const page of pages) {
    prisma.settingsVersion.findMany.mockResolvedValueOnce(page.map((id) => ({ id })));
  }
  prisma.settingsVersion.findMany.mockResolvedValue([]);
  const events = { settingsUpdated: jest.fn().mockResolvedValue(undefined), flush: jest.fn() };
  return {
    tx,
    prisma,
    events,
    service: new SettingsRepublishService(prisma as never, events as never),
  };
}

describe('SettingsRepublishService', () => {
  it('publishes every version as it is, with its own version id, and changes no row', async () => {
    const { tx, events, service } = setup([['v1', 'v2']]);

    await expect(service.republish('c-1')).resolves.toEqual({ republished: 2 });

    expect(events.settingsUpdated).toHaveBeenCalledWith(
      tx,
      {
        versionId: 'v1',
        depreciationPerKm: 1.25,
        rentalRatePerKm: 12,
        effectiveFrom: '2026-10-10',
        createdAt: '2026-10-10T15:00:00.000Z',
      },
      'c-1',
    );
    expect(events.settingsUpdated).toHaveBeenCalledTimes(2);
    expect(tx.settingsVersion.update).not.toHaveBeenCalled();
    expect(events.flush).toHaveBeenCalledTimes(1);
  });

  it('flushes nothing when no version exists', async () => {
    const { events, service } = setup([]);

    await expect(service.republish()).resolves.toEqual({ republished: 0 });
    expect(events.flush).not.toHaveBeenCalled();
  });
});
