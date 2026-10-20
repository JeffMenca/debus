import { Module } from '@nestjs/common';
import { SeatsModule } from '../seats/seats.module';
import { TripsModule } from '../trips/trips.module';
import { CounterSalesService } from './counter-sales.service';
import { CounterController } from './counter.controller';

@Module({
  imports: [SeatsModule, TripsModule],
  controllers: [CounterController],
  providers: [CounterSalesService],
})
export class CounterModule {}
