import { Module } from '@nestjs/common';
import { SeatsModule } from '../seats/seats.module';
import { InternalPurchasesController } from './internal-purchases.controller';
import { PurchaseRecoveryService } from './purchase-recovery.service';
import { PurchasesController } from './purchases.controller';
import { PurchasesService } from './purchases.service';

@Module({
  imports: [SeatsModule],
  controllers: [PurchasesController, InternalPurchasesController],
  providers: [PurchasesService, PurchaseRecoveryService],
})
export class PurchasesModule {}
