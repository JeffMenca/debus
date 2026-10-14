import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { FleetClient } from './fleet-client';
import { TripCycleService } from './trip-cycle.service';
import { TripsController } from './trips.controller';
import { TripWrites } from './trip-writes';
import { TripsService } from './trips.service';

@Module({
  imports: [SettingsModule],
  controllers: [TripsController],
  providers: [TripsService, TripCycleService, TripWrites, FleetClient],
  exports: [TripsService, TripWrites, FleetClient],
})
export class TripsModule {}
