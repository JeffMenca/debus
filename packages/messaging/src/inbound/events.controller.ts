import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { ProcessedEvent } from '../inbox/inbox-store';
import { InboundEvents } from './inbound-events';
import { PubSubPushGuard } from './pubsub-push.guard';

@ApiExcludeController()
@Controller('events')
export class EventsController {
  constructor(private readonly events: InboundEvents) {}

  @Post('pubsub')
  @HttpCode(204)
  @UseGuards(PubSubPushGuard)
  receive(@Body() body: unknown): Promise<void> {
    return this.events.receive(body);
  }

  @Get('processed/:eventId')
  processed(@Param('eventId') eventId: string): Promise<ProcessedEvent> {
    return this.events.processed(eventId);
  }
}
