import { Module } from '@nestjs/common';
import { ProfilesController } from './profiles.controller';
import { ProfilesHandler } from './profiles.handler';
import { ProfilesService } from './profiles.service';

@Module({
  controllers: [ProfilesController],
  providers: [ProfilesHandler, ProfilesService],
})
export class ProfilesModule {}
