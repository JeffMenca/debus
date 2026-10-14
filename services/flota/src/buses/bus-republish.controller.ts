import {
  CORRELATION_HEADER,
  type RepublishBusesQuery,
  type RepublishBusesResult,
  republishBusesQuerySchema,
} from '@debus/contracts';
import { ZodBody, apiErrors, apiQuery, apiSuccess } from '@debus/server';
import { Controller, Headers, HttpCode, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { BusRepublishService } from './bus-republish.service';

// For a deploy that adds a service which keeps copies of the buses: called once with the identity
// token of the deploy, never by a user, and the gateway never publishes this path.
@ApiTags('internal')
@Controller('internal/buses')
export class BusRepublishController {
  constructor(private readonly buses: BusRepublishService) {}

  @Post('republish')
  @HttpCode(200)
  @apiSuccess(200)
  @apiErrors(400)
  @apiQuery(republishBusesQuerySchema)
  republish(
    @Query(new ZodBody(republishBusesQuerySchema)) query: RepublishBusesQuery,
    @Headers(CORRELATION_HEADER) correlationId?: string,
  ): Promise<RepublishBusesResult> {
    return this.buses.republish(query.branchId, correlationId);
  }
}
