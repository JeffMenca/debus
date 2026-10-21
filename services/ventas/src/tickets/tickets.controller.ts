import {
  type TicketListQuery,
  type TicketPage,
  ticketListQuerySchema,
  ticketPageSchema,
} from '@debus/contracts';
import {
  CurrentIdentity,
  type Identity,
  Roles,
  ZodBody,
  apiErrors,
  apiQuery,
  apiSuccess,
} from '@debus/server';
import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TicketsService } from './tickets.service';

// Staff sell tickets but have no history of their own.
@ApiTags('tickets')
@ApiBearerAuth()
@Roles('CLIENT')
@Controller('tickets')
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Get()
  @apiSuccess(200, ticketPageSchema)
  @apiErrors(400)
  @apiQuery(ticketListQuerySchema)
  history(
    @CurrentIdentity() actor: Identity,
    @Query(new ZodBody(ticketListQuerySchema)) query: TicketListQuery,
  ): Promise<TicketPage> {
    return this.tickets.history(actor.userId, query);
  }
}
