import {
  CORRELATION_HEADER,
  type ConfirmRentalRequest,
  type CounterRentalRequest,
  type Rental,
  type RentalListQuery,
  type RentalPage,
  confirmRentalRequestSchema,
  counterRentalRequestSchema,
  rentalListQuerySchema,
} from '@debus/contracts';
import {
  CurrentIdentity,
  type Identity,
  Roles,
  ZodBody,
  apiBody,
  apiErrors,
  apiQuery,
  apiSuccess,
} from '@debus/server';
import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RentalsService } from './rentals.service';

@ApiTags('branch-rentals')
@ApiBearerAuth()
@Roles('BRANCH_ADMIN')
@Controller('branch-rentals')
export class BranchRentalsController {
  constructor(private readonly rentals: RentalsService) {}

  @Get()
  @apiSuccess(200)
  @apiErrors(400)
  @apiQuery(rentalListQuerySchema)
  list(
    @CurrentIdentity() actor: Identity,
    @Query(new ZodBody(rentalListQuerySchema)) query: RentalListQuery,
  ): Promise<RentalPage> {
    return this.rentals.branchList(actor, query);
  }

  @Post()
  @apiSuccess(201)
  @apiErrors(400, 404, 422)
  @apiBody(counterRentalRequestSchema)
  registerCounter(
    @CurrentIdentity() actor: Identity,
    @Body(new ZodBody(counterRentalRequestSchema)) body: CounterRentalRequest,
    @Headers(CORRELATION_HEADER) correlationId?: string,
  ): Promise<Rental> {
    return this.rentals.registerCounter(actor, body, correlationId);
  }

  @Post(':id/confirm')
  @apiSuccess(201)
  @apiErrors(400, 404, 409)
  @apiBody(confirmRentalRequestSchema)
  confirm(
    @CurrentIdentity() actor: Identity,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodBody(confirmRentalRequestSchema)) body: ConfirmRentalRequest,
    @Headers(CORRELATION_HEADER) correlationId?: string,
  ): Promise<Rental> {
    return this.rentals.confirm(actor, id, body, correlationId);
  }
}
