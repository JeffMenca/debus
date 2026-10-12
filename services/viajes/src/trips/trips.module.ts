import { Module } from '@nestjs/common';
import { FleetClient } from './fleet-client';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';

@Module({
  controllers: [TripsController],
  providers: [TripsService, FleetClient],
  exports: [TripsService],
})
export class TripsModule {}
