import { Module } from '@nestjs/common';
import { FleetCopiesHandler } from './fleet-copies.handler';

@Module({ providers: [FleetCopiesHandler] })
export class CopiesModule {}
