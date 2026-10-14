import { Module } from '@nestjs/common';
import { TripsModule } from '../trips/trips.module';
import { RentalRequestsController } from './rental-requests.controller';
import { RentalRequestsHandler } from './rental-requests.handler';
import { RentalRequestsService } from './rental-requests.service';

@Module({
  imports: [TripsModule],
  controllers: [RentalRequestsController],
  providers: [RentalRequestsHandler, RentalRequestsService],
})
export class RentalsModule {}
