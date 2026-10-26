import { Module } from '@nestjs/common';
import { InternalWalletController } from './internal-wallet.controller';
import { RefundsHandler } from './refunds.handler';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';

@Module({
  controllers: [WalletController, InternalWalletController],
  providers: [WalletService, RefundsHandler],
  exports: [WalletService],
})
export class WalletModule {}
