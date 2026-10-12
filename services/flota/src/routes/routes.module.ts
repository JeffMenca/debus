import { Module } from '@nestjs/common';
import { FleetEvents } from '../common/fleet-events';
import { RoutesController } from './routes.controller';
import { RoutesService } from './routes.service';

@Module({
  controllers: [RoutesController],
  providers: [RoutesService, FleetEvents],
  exports: [RoutesService],
})
export class RoutesModule {}
