import { MessagingModule, SqlInboxStore, httpLoggerOptions } from '@debus/messaging';
import { HttpExceptionFilter, RolesGuard } from '@debus/server';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { PrismaService } from './prisma/prisma.service';
import { SeatsModule } from './seats/seats.module';
import { TripsModule } from './trips/trips.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({ pinoHttp: httpLoggerOptions() }),
    HealthModule,
    SeatsModule,
    TripsModule,
    PrismaModule,
    MessagingModule.forRoot({
      service: 'ventas',
      inbox: {
        inject: [PrismaService],
        useFactory: (prisma: PrismaService) => new SqlInboxStore(prisma),
      },
      outbox: { inject: [PrismaService], useFactory: (prisma: PrismaService) => prisma },
    }),
  ],
  providers: [
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}
