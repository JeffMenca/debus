import { PubSubPushGuard } from '@debus/messaging';
import { Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { LicenseAlerts, type LicenseRunResult } from './license-alerts.service';

// Called every day at 08:00 (Guatemala) by Cloud Scheduler with the identity Pub/Sub push uses.
@ApiExcludeController()
@Controller('internal/license-alerts')
export class InternalLicenseAlertsController {
  constructor(private readonly alerts: LicenseAlerts) {}

  @Post('run')
  @HttpCode(200)
  @UseGuards(PubSubPushGuard)
  run(): Promise<LicenseRunResult> {
    return this.alerts.run();
  }
}
