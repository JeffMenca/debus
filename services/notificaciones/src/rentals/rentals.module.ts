import { Module } from '@nestjs/common';
import { RentalsHandler } from './rentals.handler';

@Module({ providers: [RentalsHandler] })
export class RentalsModule {}
