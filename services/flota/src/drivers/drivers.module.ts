import { Module } from '@nestjs/common';
import { FleetEvents } from '../common/fleet-events';
import { DriversController } from './drivers.controller';
import { DriversService } from './drivers.service';

@Module({
  controllers: [DriversController],
  providers: [DriversService, FleetEvents],
  exports: [DriversService],
})
export class DriversModule {}
