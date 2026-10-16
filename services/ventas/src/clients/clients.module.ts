import { Module } from '@nestjs/common';
import { ClientsHandler } from './clients.handler';

@Module({ providers: [ClientsHandler] })
export class ClientsModule {}
