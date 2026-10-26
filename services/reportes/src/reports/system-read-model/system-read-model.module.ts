import { Module } from '@nestjs/common';
import { RoutesHandler } from './routes.handler';

// The copy behind the system administrator reports that the branch read models do not cover.
@Module({ providers: [RoutesHandler] })
export class SystemReadModelModule {}
