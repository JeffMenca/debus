import { createEnvelope, exampleDriver } from '@debus/contracts';
import { DriversHandler } from './drivers.handler';

const stored = (over: Record<string, unknown> = {}) => ({
  driver_id: exampleDriver.driverId,
  branch_id: exampleDriver.branchId,
  email: exampleDriver.email,
  full_name: exampleDriver.fullName,
  license_expires_on: new Date(`${exampleDriver.licenseExpiresOn}T00:00:00.000Z`),
  active: true,
  version: exampleDriver.version,
  ...over,
});

function setup(previous: unknown[] = []) {
  const queue = { cancelPending: jest.fn().mockResolvedValue(undefined) };
  const alerts = { scheduleFor: jest.fn().mockResolvedValue(0) };
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue(previous),
    driverLicense: { upsert: jest.fn().mockResolvedValue({}) },
  };
  const handler = new DriversHandler(queue as never, alerts as never, {} as never);
  return { queue, alerts, tx, handler };
}

const next = (over: Record<string, unknown> = {}) => ({
  ...exampleDriver,
  version: exampleDriver.version + 1,
  ...over,
});

describe('DriversHandler', () => {
  it('keeps a new driver and schedules its alerts right away', async () => {
    const { tx, alerts, queue, handler } = setup();
    const envelope = createEnvelope('DriverAdded', exampleDriver, 'c');

    await handler.added(exampleDriver, envelope, tx as never);

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.driverLicense.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { driverId: exampleDriver.driverId } }),
    );
    expect(queue.cancelPending).not.toHaveBeenCalled();
    expect(alerts.scheduleFor).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        driverId: exampleDriver.driverId,
        licenseExpiresOn: exampleDriver.licenseExpiresOn,
      }),
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      envelope.eventId,
    );
  });

  it('ignores a snapshot that is not newer than the copy', async () => {
    const { tx, alerts, handler } = setup([stored()]);

    await handler.updated(
      exampleDriver,
      createEnvelope('DriverUpdated', exampleDriver, 'c'),
      tx as never,
    );

    expect(tx.driverLicense.upsert).not.toHaveBeenCalled();
    expect(alerts.scheduleFor).not.toHaveBeenCalled();
  });

  it('cancels what was pending when the expiry date changes', async () => {
    const { tx, queue, alerts, handler } = setup([stored()]);
    const renewed = next({ licenseExpiresOn: '2030-01-01' });

    await handler.updated(renewed, createEnvelope('DriverUpdated', renewed, 'c'), tx as never);

    expect(queue.cancelPending).toHaveBeenCalledWith(tx, `license:${exampleDriver.driverId}:`);
    expect(alerts.scheduleFor).toHaveBeenCalled();
  });

  it('cancels nothing when a republish brings the same data with a higher version', async () => {
    const { tx, queue, handler } = setup([stored()]);
    const republished = next();

    await handler.updated(
      republished,
      createEnvelope('DriverUpdated', republished, 'c'),
      tx as never,
    );

    expect(tx.driverLicense.upsert).toHaveBeenCalled();
    expect(queue.cancelPending).not.toHaveBeenCalled();
  });

  it('rejects an invalid payload without writing', async () => {
    const { tx, handler } = setup();

    await expect(
      handler.updated({}, createEnvelope('DriverAdded', {}, 'c'), tx as never),
    ).rejects.toThrow();
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });
});
