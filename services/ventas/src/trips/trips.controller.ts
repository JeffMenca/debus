import {
  type AvailableTripListQuery,
  type AvailableTripPage,
  type SeatMap,
  type TripPlaces,
  USER_ROLES,
  availableTripListQuerySchema,
  tripPlacesSchema,
} from '@debus/contracts';
import { Roles, ZodBody, apiErrors, apiQuery, apiSuccess } from '@debus/server';
import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TripsService } from './trips.service';

@ApiTags('trips')
@ApiBearerAuth()
// Anyone with a session may look; buying is what later checks who the person is.
@Roles(...USER_ROLES)
@Controller('trips')
export class TripsController {
  constructor(private readonly trips: TripsService) {}

  @Get()
  @apiSuccess(200)
  @apiErrors(400)
  @apiQuery(availableTripListQuerySchema)
  list(
    @Query(new ZodBody(availableTripListQuerySchema)) query: AvailableTripListQuery,
  ): Promise<AvailableTripPage> {
    return this.trips.list(query);
  }

  @Get('places')
  @apiSuccess(200, tripPlacesSchema)
  places(): Promise<TripPlaces> {
    return this.trips.places();
  }

  @Get(':tripId/seats')
  @apiSuccess(200)
  @apiErrors(400, 404)
  seatMap(@Param('tripId', new ParseUUIDPipe()) tripId: string): Promise<SeatMap> {
    return this.trips.seatMap(tripId);
  }
}
