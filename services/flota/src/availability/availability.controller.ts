import {
  type Availability,
  type AvailabilityQuery,
  availabilityQuerySchema,
} from '@debus/contracts';
import { ZodBody, apiErrors, apiQuery, apiSuccess } from '@debus/server';
import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AvailabilityService } from './availability.service';

// Called by viajes with the identity token of its service account; there is no user and the
// gateway never publishes this path.
@ApiTags('internal')
@Controller('internal/availability')
export class AvailabilityController {
  constructor(private readonly availability: AvailabilityService) {}

  @Get()
  @apiSuccess(200)
  @apiErrors(400)
  @apiQuery(availabilityQuerySchema)
  check(
    @Query(new ZodBody(availabilityQuerySchema)) query: AvailabilityQuery,
  ): Promise<Availability> {
    return this.availability.check(query);
  }
}
