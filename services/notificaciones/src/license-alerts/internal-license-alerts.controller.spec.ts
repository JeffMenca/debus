import { PubSubPushGuard } from '@debus/messaging';
import { GUARDS_METADATA, HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { DECORATORS } from '@nestjs/swagger';
import { InternalLicenseAlertsController } from './internal-license-alerts.controller';

describe('InternalLicenseAlertsController', () => {
  it('runs the daily alerts and answers what it queued', async () => {
    const alerts = { run: jest.fn().mockResolvedValue({ drivers: 2, queued: 5 }) };

    expect(await new InternalLicenseAlertsController(alerts as never).run()).toEqual({
      drivers: 2,
      queued: 5,
    });
    expect(alerts.run).toHaveBeenCalledWith();
  });

  it('is only for the scheduler: guarded by its identity and left out of the documentation', () => {
    const { run } = InternalLicenseAlertsController.prototype;

    expect(Reflect.getMetadata(GUARDS_METADATA, run)).toEqual([PubSubPushGuard]);
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, run)).toBe(200);
    expect(
      Reflect.getMetadata(DECORATORS.API_EXCLUDE_CONTROLLER, InternalLicenseAlertsController),
    ).toEqual([true]);
  });
});
