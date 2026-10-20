import {
  type AvailableTripListQuery,
  type AvailableTripPage,
  CORRELATION_HEADER,
  type CounterSaleRequest,
  type Ticket,
  availableTripListQuerySchema,
  counterSaleRequestSchema,
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
  requireBranch,
} from '@debus/server';
import { Body, Controller, Get, Headers, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { TripsService } from '../trips/trips.service';
import { CounterSalesService } from './counter-sales.service';
import { readIdempotencyKey } from './counter-rules';

// Branch staff sell in cash at the counter, only the trips that leave from their branch.
@ApiTags('counter')
@ApiBearerAuth()
@Roles('BRANCH_ADMIN', 'CASHIER')
@Controller('counter')
export class CounterController {
  constructor(
    private readonly tripsOnSale: TripsService,
    private readonly sales: CounterSalesService,
  ) {}

  @Get('trips')
  @apiSuccess(200)
  @apiErrors(400)
  @apiQuery(availableTripListQuerySchema)
  trips(
    @CurrentIdentity() actor: Identity,
    @Query(new ZodBody(availableTripListQuerySchema)) query: AvailableTripListQuery,
  ): Promise<AvailableTripPage> {
    return this.tripsOnSale.list(query, requireBranch(actor));
  }

  @Post('tickets')
  @apiSuccess(201)
  @apiErrors(400, 404, 409)
  @apiBody(counterSaleRequestSchema)
  @ApiHeader({ name: IDEMPOTENCY_HEADER, required: true, description: 'The id of the new ticket.' })
  sell(
    @CurrentIdentity() actor: Identity,
    @Body(new ZodBody(counterSaleRequestSchema)) body: CounterSaleRequest,
    @Headers(IDEMPOTENCY_HEADER) key?: string,
    @Headers(CORRELATION_HEADER) correlationId?: string,
  ): Promise<Ticket> {
    return this.sales.sell(actor, readIdempotencyKey(key), body, correlationId);
  }
}
