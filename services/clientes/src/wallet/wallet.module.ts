import { Module } from '@nestjs/common';
import { InternalWalletController } from './internal-wallet.controller';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';

@Module({
  controllers: [WalletController, InternalWalletController],
  providers: [WalletService],
})
export class WalletModule {}
