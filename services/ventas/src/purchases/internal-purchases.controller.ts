import { Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { PubSubPushGuard } from '@debus/messaging';
import { type RecoveryResult, PurchaseRecoveryService } from './purchase-recovery.service';

// Called every minute by Cloud Scheduler with the same OIDC identity Pub/Sub push uses; the gateway never publishes it.
@ApiExcludeController()
@Controller('internal/purchases')
export class InternalPurchasesController {
  constructor(private readonly recovery: PurchaseRecoveryService) {}

  @Post('recover')
  @HttpCode(200)
  @UseGuards(PubSubPushGuard)
  recover(): Promise<RecoveryResult> {
    return this.recovery.recover();
  }
}
