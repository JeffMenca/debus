import { Module } from '@nestjs/common';
import { FleetCopiesHandler } from './fleet-copies.handler';
import { RentalsHandler } from './rentals.handler';
import { RepairsHandler } from './repairs.handler';
import { SettingsHandler } from './settings.handler';
import { TicketSalesHandler } from './ticket-sales.handler';
import { TripFactsHandler } from './trip-facts.handler';

// The read models behind the branch administrator reports, fed only by events.
@Module({
  providers: [
    FleetCopiesHandler,
    TripFactsHandler,
    SettingsHandler,
    RepairsHandler,
    TicketSalesHandler,
    RentalsHandler,
  ],
})
export class BranchReadModelModule {}
