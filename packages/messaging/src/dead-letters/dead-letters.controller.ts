import {
  type DeadLetterList,
  type DeadLetterListQuery,
  type ReplayResult,
  deadLetterListQuerySchema,
} from '@debus/contracts';
import { Roles, ZodBody, apiErrors, apiQuery, apiSuccess } from '@debus/server';
import { Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DeadLetters } from './dead-letters';

// Reached through the gateway as /api/<service>/dead-letters; the global RolesGuard checks the role.
@ApiTags('dead-letters')
@ApiBearerAuth()
@Roles('SYSTEM_ADMIN')
@Controller('dead-letters')
export class DeadLettersController {
  constructor(private readonly deadLetters: DeadLetters) {}

  @Get()
  @apiSuccess(200)
  @apiErrors(400, 503)
  @apiQuery(deadLetterListQuerySchema)
  list(
    @Query(new ZodBody(deadLetterListQuerySchema)) query: DeadLetterListQuery,
  ): Promise<DeadLetterList> {
    return this.deadLetters.list(query.limit);
  }

  @Post(':messageId/replay')
  @HttpCode(200)
  @apiSuccess(200)
  @apiErrors(404, 502, 503)
  replay(@Param('messageId') messageId: string): Promise<ReplayResult> {
    return this.deadLetters.replay(messageId);
  }

  @Delete(':messageId')
  @HttpCode(204)
  @apiSuccess(204)
  @apiErrors(404, 503)
  discard(@Param('messageId') messageId: string): Promise<void> {
    return this.deadLetters.discard(messageId);
  }
}
