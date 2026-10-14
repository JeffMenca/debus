import {
  type AssignRentalRequest,
  CORRELATION_HEADER,
  type RentalRequestListQuery,
  type RentalRequestPage,
  type Trip,
  assignRentalRequestSchema,
  rentalRequestListQuerySchema,
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
  requireBranch,
} from '@debus/server';
import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RentalRequestsService } from './rental-requests.service';

@ApiTags('rental-requests')
@ApiBearerAuth()
@Roles('BRANCH_ADMIN')
@Controller('rental-requests')
export class RentalRequestsController {
  constructor(private readonly requests: RentalRequestsService) {}

  @Get()
  @apiSuccess(200)
  @apiErrors(400)
  @apiQuery(rentalRequestListQuerySchema)
  list(
    @CurrentIdentity() actor: Identity,
    @Query(new ZodBody(rentalRequestListQuerySchema)) query: RentalRequestListQuery,
  ): Promise<RentalRequestPage> {
    return this.requests.list(requireBranch(actor), query);
  }

  @Post(':id/assignment')
  @apiSuccess(201)
  @apiErrors(400, 404, 409, 502, 503)
  @apiBody(assignRentalRequestSchema)
  assign(
    @CurrentIdentity() actor: Identity,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodBody(assignRentalRequestSchema)) body: AssignRentalRequest,
    @Headers(CORRELATION_HEADER) correlationId?: string,
  ): Promise<Trip> {
    return this.requests.assign(actor, id, body, correlationId);
  }
}
