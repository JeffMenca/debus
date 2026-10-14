import { Module } from '@nestjs/common';
import { FleetCopiesHandler } from './fleet-copies.handler';
import { TripFactsHandler } from './trip-facts.handler';

// The read models behind the branch administrator reports, fed only by events.
@Module({ providers: [FleetCopiesHandler, TripFactsHandler] })
export class BranchReadModelModule {}
