import { Module } from '@nestjs/common';
import { ClientsController } from './clients.controller';
import { ProfilesController } from './profiles.controller';
import { ProfilesHandler } from './profiles.handler';
import { ProfilesService } from './profiles.service';

@Module({
  controllers: [ProfilesController, ClientsController],
  providers: [ProfilesHandler, ProfilesService],
})
export class ProfilesModule {}
