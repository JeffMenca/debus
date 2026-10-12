import { Module } from '@nestjs/common';
import { AdminEvents } from '../common/admin-events';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  controllers: [SettingsController],
  providers: [SettingsService, AdminEvents],
})
export class SettingsModule {}
