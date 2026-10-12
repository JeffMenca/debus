import { AvailabilityService } from './availability.service';

const branchId = '9b2c7a10-1111-4c4c-8888-123456789abc';
const busId = '1f0e2d3c-4b5a-4968-8776-655443322110';
const driverId = '2a1b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const query = {
  branchId,
  busId,
  driverId,
  departureAt: '2026-10-20T12:00:00.000Z',
  estimatedArrivalAt: '2026-10-20T16:00:00.000Z',
};
const bus = { id: busId, branchId, active: true, operationalStatus: 'AVAILABLE' as const };
const driver = {
  id: driverId,
  branchId,
  active: true,
  licenseExpiresOn: new Date('2027-01-01T00:00:00.000Z'),
};
const copy = (from: string, to: string) => ({
  departureAt: new Date(from),
  estimatedArrivalAt: new Date(to),
});

const setup = () => {
  const prisma = {
    bus: { findUnique: jest.fn().mockResolvedValue(bus) },
    driver: { findUnique: jest.fn().mockResolvedValue(driver) },
    tripCopy: { findMany: jest.fn().mockResolvedValue([]) },
  };
  return { prisma, service: new AvailabilityService(prisma as never) };
};

describe('AvailabilityService.check', () => {
  it('says both are free when nothing crosses the window', async () => {
    const { service } = setup();

    await expect(service.check(query)).resolves.toEqual({
      bus: { available: true },
      driver: { available: true },
    });
  });

  it('looks only at the trips that are still ahead of the departure and ignores the one being moved', async () => {
    const { prisma, service } = setup();

    await service.check({ ...query, ignoreTripId: 'f4c3b2a1-0000-4000-8000-000000000000' });

    expect(prisma.tripCopy.findMany).toHaveBeenNthCalledWith(1, {
      where: {
        busId,
        status: { in: ['SCHEDULED', 'IN_TRANSIT'] },
        estimatedArrivalAt: { gt: new Date(query.departureAt) },
        NOT: { tripId: 'f4c3b2a1-0000-4000-8000-000000000000' },
      },
      select: { departureAt: true, estimatedArrivalAt: true },
    });
    expect(prisma.tripCopy.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: expect.objectContaining({ driverId }) }),
    );
  });

  it('does not exclude any trip when none is being moved', async () => {
    const { prisma, service } = setup();

    await service.check(query);

    expect(prisma.tripCopy.findMany.mock.calls[0][0].where).not.toHaveProperty('NOT');
  });

  it('marks the bus and the driver busy when a trip of theirs crosses the window', async () => {
    const { prisma, service } = setup();
    prisma.tripCopy.findMany.mockResolvedValue([
      copy('2026-10-20T15:00:00.000Z', '2026-10-20T18:00:00.000Z'),
    ]);

    await expect(service.check(query)).resolves.toEqual({
      bus: { available: false, reason: 'BUSY' },
      driver: { available: false, reason: 'BUSY' },
    });
  });

  it('lets a trip that starts when the window ends go ahead', async () => {
    const { prisma, service } = setup();
    prisma.tripCopy.findMany.mockResolvedValue([
      copy('2026-10-20T16:00:00.000Z', '2026-10-20T19:00:00.000Z'),
    ]);

    const verdict = await service.check(query);

    expect(verdict.bus.available).toBe(true);
  });

  it('reads the licence on the Guatemalan day of the departure', async () => {
    const { prisma, service } = setup();
    // 02:00 UTC of the 21st is still the 20th in Guatemala.
    prisma.driver.findUnique.mockResolvedValue({
      ...driver,
      licenseExpiresOn: new Date('2026-10-20T00:00:00.000Z'),
    });

    const verdict = await service.check({
      ...query,
      departureAt: '2026-10-21T02:00:00.000Z',
      estimatedArrivalAt: '2026-10-21T05:00:00.000Z',
    });

    expect(verdict.driver).toEqual({ available: true });
  });

  it('reports a bus or driver it does not know', async () => {
    const { prisma, service } = setup();
    prisma.bus.findUnique.mockResolvedValue(null);
    prisma.driver.findUnique.mockResolvedValue(null);

    await expect(service.check(query)).resolves.toEqual({
      bus: { available: false, reason: 'NOT_FOUND' },
      driver: { available: false, reason: 'NOT_FOUND' },
    });
  });
});
