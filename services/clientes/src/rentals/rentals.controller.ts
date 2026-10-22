import {
  CORRELATION_HEADER,
  type PayRentalRequest,
  type Rental,
  type RentalEstimate,
  type RentalEstimateQuery,
  type RentalListQuery,
  type RentalPage,
  type RentalRequest,
  payRentalRequestSchema,
  rentalEstimateQuerySchema,
  rentalListQuerySchema,
  rentalRequestSchema,
} from '@debus/contracts';
import {
  CurrentIdentity,
  IDEMPOTENCY_HEADER,
  type Identity,
  Roles,
  ZodBody,
  apiBody,
  apiErrors,
  apiQuery,
  apiSuccess,
  readIdempotencyKey,
} from '@debus/server';
import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { MESSAGES } from '../messages';
import { RentalsService } from './rentals.service';

@ApiTags('rentals')
@ApiBearerAuth()
@Controller('rentals')
export class RentalsController {
  constructor(private readonly rentals: RentalsService) {}

  @Get('estimate')
  @Roles('CLIENT', 'BRANCH_ADMIN')
  @apiSuccess(200)
  @apiErrors(400, 422)
  @apiQuery(rentalEstimateQuerySchema)
  estimate(
    @Query(new ZodBody(rentalEstimateQuerySchema)) query: RentalEstimateQuery,
  ): Promise<RentalEstimate> {
    return this.rentals.estimate(query.distanceKm);
  }

  @Post()
  @Roles('CLIENT')
  @apiSuccess(201)
  @apiErrors(400, 404, 422)
  @apiBody(rentalRequestSchema)
  request(
    @CurrentIdentity() actor: Identity,
    @Body(new ZodBody(rentalRequestSchema)) body: RentalRequest,
  ): Promise<Rental> {
    return this.rentals.request(actor, body);
  }

  @Get('mine')
  @Roles('CLIENT')
  @apiSuccess(200)
  @apiErrors(400, 404)
  @apiQuery(rentalListQuerySchema)
  history(
    @CurrentIdentity() actor: Identity,
    @Query(new ZodBody(rentalListQuerySchema)) query: RentalListQuery,
  ): Promise<RentalPage> {
    return this.rentals.history(actor, query);
  }

  // The client pays an online rental from the wallet; the branch admin takes the cash of a counter one.
  @Post(':id/pay')
  @Roles('CLIENT', 'BRANCH_ADMIN')
  @apiSuccess(201)
  @apiErrors(400, 404, 409, 422)
  @apiBody(payRentalRequestSchema)
  @ApiHeader({ name: IDEMPOTENCY_HEADER, required: true, description: 'The rental id.' })
  pay(
    @CurrentIdentity() actor: Identity,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodBody(payRentalRequestSchema)) body: PayRentalRequest,
    @Headers(IDEMPOTENCY_HEADER) key?: string,
    @Headers(CORRELATION_HEADER) correlationId?: string,
  ): Promise<Rental> {
    const idempotencyKey = readIdempotencyKey(key, MESSAGES.keyMissing);
    return this.rentals.pay(actor, id, idempotencyKey, body, correlationId);
  }

  @Post(':id/cancel')
  @Roles('CLIENT', 'BRANCH_ADMIN')
  @apiSuccess(201)
  @apiErrors(400, 404, 409)
  cancel(
    @CurrentIdentity() actor: Identity,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<Rental> {
    return this.rentals.cancel(actor, id);
  }
}
