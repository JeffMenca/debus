import { Module } from '@nestjs/common';
import { TicketsHandler } from './tickets.handler';

@Module({ providers: [TicketsHandler] })
export class TicketsModule {}
