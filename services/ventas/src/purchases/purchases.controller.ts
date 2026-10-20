import {
  CORRELATION_HEADER,
  type Purchase,
  type PurchaseTicketRequest,
  purchaseSchema,
  purchaseTicketRequestSchema,
} from '@debus/contracts';
import {
  CurrentIdentity,
  IDEMPOTENCY_HEADER,
  type Identity,
  ZodBody,
  apiAlsoSuccess,
  apiBody,
  apiErrors,
  apiSuccess,
  readIdempotencyKey,
} from '@debus/server';
import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { MESSAGES } from '../messages';
import { PurchasesService } from './purchases.service';

interface StatusSetter {
  status(code: number): unknown;
}

// Any person with a session buys with their own wallet.
@ApiTags('purchases')
@ApiBearerAuth()
@Controller('purchases')
export class PurchasesController {
  constructor(private readonly purchases: PurchasesService) {}

  @Post()
  @apiSuccess(201, purchaseSchema)
  @apiAlsoSuccess(
    202,
    'Accepted: the seats are held and the payment is still being confirmed. Repeat the same request, with the same key, or read the purchase later.',
    purchaseSchema,
  )
  @apiErrors(400, 401, 404, 409, 422, 503)
  @apiBody(purchaseTicketRequestSchema)
  @ApiHeader({
    name: IDEMPOTENCY_HEADER,
    required: true,
    description: 'The id of the new ticket. Repeating it never charges twice.',
  })
  async buy(
    @CurrentIdentity() actor: Identity,
    @Body(new ZodBody(purchaseTicketRequestSchema)) body: PurchaseTicketRequest,
    @Res({ passthrough: true }) response: StatusSetter,
    @Headers(IDEMPOTENCY_HEADER) key?: string,
    @Headers(CORRELATION_HEADER) correlationId?: string,
  ): Promise<Purchase> {
    const ticketId = readIdempotencyKey(key, MESSAGES.purchaseKeyMissing);
    const purchase = await this.purchases.purchase(actor, ticketId, body, correlationId);
    response.status(purchase.status === 'CONFIRMED' ? 201 : 202);
    return purchase;
  }

  @Get(':ticketId')
  @apiSuccess(200, purchaseSchema)
  @apiErrors(400, 401, 404)
  get(
    @CurrentIdentity() actor: Identity,
    @Param('ticketId', new ParseUUIDPipe()) ticketId: string,
  ): Promise<Purchase> {
    return this.purchases.get(actor, ticketId);
  }
}
