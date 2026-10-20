import { Module } from '@nestjs/common';
import { SeatReservationsService } from './seat-reservations.service';

@Module({
  providers: [SeatReservationsService],
  exports: [SeatReservationsService],
})
export class SeatsModule {}
