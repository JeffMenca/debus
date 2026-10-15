import {
  CORRELATION_HEADER,
  type RepublishQuery,
  type RepublishResult,
  republishQuerySchema,
} from '@debus/contracts';
import { ZodBody, apiErrors, apiQuery, apiSuccess } from '@debus/server';
import { Controller, Headers, HttpCode, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { BranchRepublishService } from './branch-republish.service';

// For a deploy that adds a service which keeps copies of the branches: called once with the identity
// token of the deploy, never by a user, and the gateway never publishes this path.
@ApiTags('internal')
@Controller('internal/branches')
export class BranchRepublishController {
  constructor(private readonly branches: BranchRepublishService) {}

  @Post('republish')
  @HttpCode(200)
  @apiSuccess(200)
  @apiErrors(400)
  @apiQuery(republishQuerySchema)
  republish(
    @Query(new ZodBody(republishQuerySchema)) query: RepublishQuery,
    @Headers(CORRELATION_HEADER) correlationId?: string,
  ): Promise<RepublishResult> {
    return this.branches.republish(query.branchId, correlationId);
  }
}
