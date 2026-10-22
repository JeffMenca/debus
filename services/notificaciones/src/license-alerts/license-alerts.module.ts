import { Module } from '@nestjs/common';
import { DriversHandler } from './drivers.handler';
import { InternalLicenseAlertsController } from './internal-license-alerts.controller';
import { LicenseAlerts } from './license-alerts.service';

@Module({
  controllers: [InternalLicenseAlertsController],
  providers: [LicenseAlerts, DriversHandler],
})
export class LicenseAlertsModule {}
