import {
  WALLET_DEBIT_PATH,
  type WalletDebit,
  type WalletDebitRequest,
  walletDebitRequestSchema,
  walletDebitSchema,
} from '@debus/contracts';
import {
  IDEMPOTENCY_HEADER,
  ZodBody,
  apiBody,
  apiErrors,
  apiSuccess,
  readIdempotencyKey,
} from '@debus/server';
import { Body, Controller, Headers, Post } from '@nestjs/common';
import { ApiHeader, ApiResponse, ApiTags } from '@nestjs/swagger';
import { MESSAGES } from '../messages';
import { WalletService } from './wallet.service';

// Called by ventas with the identity token of its service account; there is no user and the
// gateway never publishes this path.
@ApiTags('internal')
@Controller()
export class InternalWalletController {
  constructor(private readonly wallet: WalletService) {}

  @Post(WALLET_DEBIT_PATH)
  @apiSuccess(200, walletDebitSchema)
  @apiErrors(400, 404, 409)
  @ApiResponse({
    status: 422,
    description: 'The wallet balance does not cover the amount, or the payBy moment has passed.',
  })
  @apiBody(walletDebitRequestSchema)
  @ApiHeader({ name: IDEMPOTENCY_HEADER, required: true, description: 'The reference it pays.' })
  debit(
    @Body(new ZodBody(walletDebitRequestSchema)) body: WalletDebitRequest,
    @Headers(IDEMPOTENCY_HEADER) key?: string,
  ): Promise<WalletDebit> {
    return this.wallet.debit(readIdempotencyKey(key, MESSAGES.keyMissing), body);
  }
}
