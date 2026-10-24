import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { WalletModule } from '../wallet/wallet.module';
import { BranchRentalsController } from './branch-rentals.controller';
import { RentalCancelledHandler } from './rental-cancelled.handler';
import { RentalsController } from './rentals.controller';
import { RentalsService } from './rentals.service';

@Module({
  imports: [SettingsModule, WalletModule],
  controllers: [RentalsController, BranchRentalsController],
  providers: [RentalsService, RentalCancelledHandler],
})
export class RentalsModule {}
