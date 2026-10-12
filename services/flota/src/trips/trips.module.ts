import { Module } from '@nestjs/common';
import { TripCopiesHandler } from './trip-copies.handler';

@Module({ providers: [TripCopiesHandler] })
export class TripsModule {}
