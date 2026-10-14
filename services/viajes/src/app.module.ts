import { MessagingModule, SqlInboxStore, httpLoggerOptions } from '@debus/messaging';
import { HttpExceptionFilter, RolesGuard, ServiceClientModule } from '@debus/server';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { BranchesModule } from './branches/branches.module';
import { CopiesModule } from './copies/copies.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { PrismaService } from './prisma/prisma.service';
import { RentalsModule } from './rentals/rentals.module';
import { SaleStatusModule } from './sale-status/sale-status.module';
import { SettingsModule } from './settings/settings.module';
import { TripsModule } from './trips/trips.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({ pinoHttp: httpLoggerOptions() }),
    HealthModule,
    BranchesModule,
    CopiesModule,
    SettingsModule,
    ServiceClientModule.forRoot(),
    TripsModule,
    RentalsModule,
    SaleStatusModule,
    PrismaModule,
    MessagingModule.forRoot({
      service: 'viajes',
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
