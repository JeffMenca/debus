import { Module } from '@nestjs/common';
import { BusCopiesHandler } from './bus-copies.handler';

@Module({ providers: [BusCopiesHandler] })
export class FleetModule {}
