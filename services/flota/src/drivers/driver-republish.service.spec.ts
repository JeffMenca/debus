import { DriverRepublishService } from './driver-republish.service';

const driver = (id: string, version: number) => ({
  id,
  fullName: 'Chofer Prueba',
  email: 'chofer@debus.test',
  phone: '55550000',
  licenseNumber: '1234567890101',
  licenseType: 'A',
  licenseExpiresOn: new Date('2027-01-31T00:00:00.000Z'),
  baseSalary: { toNumber: () => 4500 },
  branchId: 'branch',
  active: true,
  version,
});

function setup(pages: string[][]) {
  const tx = { driver: { update: jest.fn(({ where }) => Promise.resolve(driver(where.id, 3))) } };
  const prisma = {
    driver: { findMany: jest.fn() },
    $transaction: jest.fn((work) => work(tx)),
  };
  for (const page of pages)
    prisma.driver.findMany.mockResolvedValueOnce(page.map((id) => ({ id })));
  prisma.driver.findMany.mockResolvedValue([]);
  const events = { driver: jest.fn().mockResolvedValue(undefined), flush: jest.fn() };
  return {
    tx,
    prisma,
    events,
    service: new DriverRepublishService(prisma as never, events as never),
  };
}

describe('DriverRepublishService', () => {
  it('raises the version of every driver of the branch and queues a DriverUpdated for it', async () => {
    const { tx, prisma, events, service } = setup([['a', 'b']]);

    await expect(service.republish('branch', 'c-1')).resolves.toEqual({ republished: 2 });

    expect(prisma.driver.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { branchId: 'branch' } }),
    );
    expect(tx.driver.update).toHaveBeenCalledWith({
      where: { id: 'a' },
      data: { version: { increment: 1 } },
    });
    expect(events.driver).toHaveBeenCalledWith(
      tx,
      'DriverUpdated',
      expect.objectContaining({ driverId: 'a', version: 3, licenseExpiresOn: '2027-01-31' }),
      'c-1',
    );
    expect(events.driver).toHaveBeenCalledTimes(2);
    expect(events.flush).toHaveBeenCalledTimes(1);
  });

  it('takes every branch when none is given and flushes nothing when there are no drivers', async () => {
    const { prisma, events, service } = setup([]);

    await expect(service.republish()).resolves.toEqual({ republished: 0 });
    expect(prisma.driver.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { branchId: undefined } }),
    );
    expect(events.flush).not.toHaveBeenCalled();
  });
});
