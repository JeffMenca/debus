import { Module } from '@nestjs/common';
import { FleetEvents } from '../common/fleet-events';
import { BusesController } from './buses.controller';
import { BusesService } from './buses.service';

@Module({
  controllers: [BusesController],
  providers: [BusesService, FleetEvents],
  exports: [BusesService],
})
export class BusesModule {}
