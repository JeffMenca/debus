import { LicenseAlerts } from './license-alerts.service';

const today = '2026-10-21';
const driver = {
  driverId: 'd-1',
  branchId: 'b-1',
  email: 'luis@correo.com',
  fullName: 'Luis Pérez',
  licenseExpiresOn: '2026-10-31',
  active: true,
};
const admins = [
  { email: 'marta@correo.com', fullName: 'Marta' },
  { email: 'jose@correo.com', fullName: 'José' },
];

function setup() {
  const queue = { enqueue: jest.fn().mockResolvedValue(3) };
  const db = {
    branchAdmin: { findMany: jest.fn().mockResolvedValue(admins) },
    driverLicense: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ ...driver, licenseExpiresOn: new Date('2026-10-31T00:00:00.000Z') }]),
    },
    ticketCopy: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    cancelledTrip: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
  };
  return { queue, db, alerts: new LicenseAlerts(queue as never, db as never) };
}

describe('LicenseAlerts', () => {
  it('queues the alert due to the driver and to every active admin of the branch', async () => {
    const { queue, db, alerts } = setup();
    const tx = db;

    expect(await alerts.scheduleFor(tx as never, driver, today, 'e-1')).toBe(3);

    expect(db.branchAdmin.findMany).toHaveBeenCalledWith({
      where: { branchId: 'b-1', active: true },
      orderBy: { userId: 'asc' },
    });
    const [, emails] = queue.enqueue.mock.calls[0];
    expect(emails.map((email: { message: { to: string } }) => email.message.to)).toEqual([
      'luis@correo.com',
      'marta@correo.com',
      'jose@correo.com',
    ]);
    expect(emails[0]).toMatchObject({
      eventId: 'e-1',
      dedupeKey: 'license:d-1:2026-10-31:15',
      template: 'LICENSE_DRIVER',
    });
    expect(emails[1].template).toBe('LICENSE_ADMIN');
    expect(emails[0].message.subject).toBe('Tu licencia vence en 10 días');
  });

  it('queues nothing for an inactive driver or a licence far from expiring', async () => {
    const { queue, alerts } = setup();

    expect(await alerts.scheduleFor(undefined, { ...driver, active: false }, today, 'e')).toBe(0);
    expect(
      await alerts.scheduleFor(
        undefined,
        { ...driver, licenseExpiresOn: '2026-12-31' },
        today,
        'e',
      ),
    ).toBe(0);
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('goes through the active drivers within 30 days and prunes the old copies', async () => {
    const { db, alerts } = setup();

    expect(await alerts.run(today)).toEqual({ drivers: 1, queued: 3 });

    expect(db.driverLicense.findMany).toHaveBeenCalledWith({
      where: {
        active: true,
        licenseExpiresOn: {
          gte: new Date('2026-10-21T00:00:00.000Z'),
          lte: new Date('2026-11-20T00:00:00.000Z'),
        },
      },
      orderBy: { driverId: 'asc' },
    });
    expect(db.ticketCopy.deleteMany).toHaveBeenCalledWith({
      where: { departureAt: { lt: expect.any(Date) } },
    });
    expect(db.cancelledTrip.deleteMany).toHaveBeenCalledWith({
      where: { cancelledAt: { lt: expect.any(Date) } },
    });
  });
});
