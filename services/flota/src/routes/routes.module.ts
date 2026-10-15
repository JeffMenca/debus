import { Module } from '@nestjs/common';
import { FleetEvents } from '../common/fleet-events';
import { RouteRepublishController } from './route-republish.controller';
import { RouteRepublishService } from './route-republish.service';
import { RoutesController } from './routes.controller';
import { RoutesService } from './routes.service';

@Module({
  controllers: [RoutesController, RouteRepublishController],
  providers: [RoutesService, RouteRepublishService, FleetEvents],
  exports: [RoutesService],
})
export class RoutesModule {}
