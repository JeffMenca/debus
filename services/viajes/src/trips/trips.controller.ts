import {
  CORRELATION_HEADER,
  type ScheduleTripRequest,
  type Trip,
  type TripListQuery,
  type TripPage,
  scheduleTripRequestSchema,
  tripListQuerySchema,
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
import { TripsService } from './trips.service';

@ApiTags('trips')
@ApiBearerAuth()
@Roles('BRANCH_ADMIN')
@Controller('trips')
export class TripsController {
  constructor(private readonly trips: TripsService) {}

  @Get()
  @apiSuccess(200)
  @apiErrors(400)
  @apiQuery(tripListQuerySchema)
  list(
    @CurrentIdentity() actor: Identity,
    @Query(new ZodBody(tripListQuerySchema)) query: TripListQuery,
  ): Promise<TripPage> {
    return this.trips.list(requireBranch(actor), query);
  }

  @Get(':id')
  @apiSuccess(200)
  @apiErrors(400, 404)
  get(
    @CurrentIdentity() actor: Identity,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<Trip> {
    return this.trips.get(requireBranch(actor), id);
  }

  @Post()
  @apiSuccess(201)
  @apiErrors(400, 409, 502, 503)
  @apiBody(scheduleTripRequestSchema)
  schedule(
    @CurrentIdentity() actor: Identity,
    @Body(new ZodBody(scheduleTripRequestSchema)) body: ScheduleTripRequest,
    @Headers(CORRELATION_HEADER) correlationId?: string,
  ): Promise<Trip> {
    return this.trips.schedule(actor, body, correlationId);
  }
}
