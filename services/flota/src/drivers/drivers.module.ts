import { Module } from '@nestjs/common';
import { FleetEvents } from '../common/fleet-events';
import { DriverRepublishController } from './driver-republish.controller';
import { DriverRepublishService } from './driver-republish.service';
import { DriversController } from './drivers.controller';
import { DriversService } from './drivers.service';

@Module({
  controllers: [DriversController, DriverRepublishController],
  providers: [DriversService, DriverRepublishService, FleetEvents],
  exports: [DriversService],
})
export class DriversModule {}
