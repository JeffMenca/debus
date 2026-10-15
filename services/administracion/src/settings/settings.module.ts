import { Module } from '@nestjs/common';
import { AdminEvents } from '../common/admin-events';
import { SettingsRepublishController } from './settings-republish.controller';
import { SettingsRepublishService } from './settings-republish.service';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  controllers: [SettingsController, SettingsRepublishController],
  providers: [SettingsService, SettingsRepublishService, AdminEvents],
})
export class SettingsModule {}
