import { Module } from '@nestjs/common';
import { TripsController } from './trips.controller';
import { TripsHandler } from './trips.handler';
import { TripsService } from './trips.service';

@Module({
  controllers: [TripsController],
  providers: [TripsHandler, TripsService],
  exports: [TripsService],
})
export class TripsModule {}
