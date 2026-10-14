import {
  CORRELATION_HEADER,
  type ScheduleTripRequest,
  type RecordArrivalRequest,
  type RecordDepartureRequest,
  type Trip,
  type TripDetail,
  type TripListQuery,
  type TripPage,
  recordArrivalRequestSchema,
  recordDepartureRequestSchema,
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
} from '@debus/server';
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TripCycleService } from './trip-cycle.service';
import { TripsService } from './trips.service';

@ApiTags('trips')
@ApiBearerAuth()
@Roles('BRANCH_ADMIN')
@Controller('trips')
export class TripsController {
  constructor(
    private readonly trips: TripsService,
    private readonly cycle: TripCycleService,
  ) {}

  @Get()
  @Roles('BRANCH_ADMIN', 'DRIVER')
  @apiSuccess(200)
  @apiErrors(400)
  @apiQuery(tripListQuerySchema)
  list(
    @CurrentIdentity() actor: Identity,
    @Query(new ZodBody(tripListQuerySchema)) query: TripListQuery,
  ): Promise<TripPage> {
    return this.trips.list(actor, query);
  }

  @Get(':id')
  @Roles('BRANCH_ADMIN', 'DRIVER')
  @apiSuccess(200)
  @apiErrors(400, 404)
  get(
    @CurrentIdentity() actor: Identity,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<TripDetail> {
    return this.trips.get(actor, id);
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

  @Post(':id/departure')
  @Roles('BRANCH_ADMIN', 'DRIVER')
  @apiSuccess(201)
  @apiErrors(400, 404, 409)
  @apiBody(recordDepartureRequestSchema)
  recordDeparture(
    @CurrentIdentity() actor: Identity,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodBody(recordDepartureRequestSchema)) body: RecordDepartureRequest,
    @Headers(CORRELATION_HEADER) correlationId?: string,
  ): Promise<TripDetail> {
    return this.cycle.recordDeparture(actor, id, body, correlationId);
  }

  @Post(':id/arrival')
  @Roles('BRANCH_ADMIN', 'DRIVER')
  @apiSuccess(201)
  @apiErrors(400, 404, 409)
  @apiBody(recordArrivalRequestSchema)
  recordArrival(
    @CurrentIdentity() actor: Identity,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodBody(recordArrivalRequestSchema)) body: RecordArrivalRequest,
    @Headers(CORRELATION_HEADER) correlationId?: string,
  ): Promise<TripDetail> {
    return this.cycle.recordArrival(actor, id, body, correlationId);
  }

  @Delete(':id')
  @HttpCode(204)
  @apiSuccess(204)
  @apiErrors(400, 404, 409)
  remove(
    @CurrentIdentity() actor: Identity,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers(CORRELATION_HEADER) correlationId?: string,
  ): Promise<void> {
    return this.cycle.remove(actor, id, correlationId);
  }
}
