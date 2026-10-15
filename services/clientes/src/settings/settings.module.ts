import { Module } from '@nestjs/common';
import { SettingsCopyService } from './settings-copy.service';
import { SettingsHandler } from './settings.handler';

@Module({
  providers: [SettingsHandler, SettingsCopyService],
  exports: [SettingsCopyService],
})
export class SettingsModule {}
