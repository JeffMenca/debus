import { Module } from '@nestjs/common';
import { FleetEvents } from '../common/fleet-events';
import { BusRepublishController } from './bus-republish.controller';
import { BusRepublishService } from './bus-republish.service';
import { BusesController } from './buses.controller';
import { BusesService } from './buses.service';

@Module({
  controllers: [BusesController, BusRepublishController],
  providers: [BusesService, BusRepublishService, FleetEvents],
  exports: [BusesService],
})
export class BusesModule {}
