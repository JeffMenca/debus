import {
  type TopUpRequest,
  type Wallet,
  type WalletMovementListQuery,
  type WalletMovementPage,
  topUpRequestSchema,
  walletMovementListQuerySchema,
} from '@debus/contracts';
import {
  CurrentIdentity,
  IDEMPOTENCY_HEADER,
  type Identity,
  ZodBody,
  apiBody,
  apiErrors,
  apiQuery,
  apiSuccess,
} from '@debus/server';
import { Body, Controller, Get, Headers, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { readIdempotencyKey } from './wallet-rules';
import { WalletService } from './wallet.service';

@ApiTags('wallet')
@ApiBearerAuth()
@Controller('wallet')
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  @Get()
  @apiSuccess(200)
  @apiErrors(401, 404)
  get(@CurrentIdentity() actor: Identity): Promise<Wallet> {
    return this.wallet.get(actor.userId);
  }

  @Post('top-ups')
  @apiSuccess(201)
  @apiErrors(400, 401, 404, 409)
  @apiBody(topUpRequestSchema)
  @ApiHeader({ name: IDEMPOTENCY_HEADER, required: true, description: 'A uuid per top-up.' })
  topUp(
    @CurrentIdentity() actor: Identity,
    @Body(new ZodBody(topUpRequestSchema)) body: TopUpRequest,
    @Headers(IDEMPOTENCY_HEADER) key?: string,
  ): Promise<Wallet> {
    return this.wallet.topUp(actor.userId, readIdempotencyKey(key), body);
  }

  @Get('movements')
  @apiSuccess(200)
  @apiErrors(400, 401)
  @apiQuery(walletMovementListQuerySchema)
  movements(
    @CurrentIdentity() actor: Identity,
    @Query(new ZodBody(walletMovementListQuerySchema)) query: WalletMovementListQuery,
  ): Promise<WalletMovementPage> {
    return this.wallet.movements(actor.userId, query);
  }
}
