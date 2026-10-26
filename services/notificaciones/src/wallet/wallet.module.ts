import { Module } from '@nestjs/common';
import { WalletHandler } from './wallet.handler';

@Module({ providers: [WalletHandler] })
export class WalletModule {}
