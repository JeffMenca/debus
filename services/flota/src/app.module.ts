import { MessagingModule, SqlInboxStore, httpLoggerOptions } from '@debus/messaging';
import { HttpExceptionFilter, RolesGuard } from '@debus/server';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { AvailabilityModule } from './availability/availability.module';
import { BranchesModule } from './branches/branches.module';
import { BusesModule } from './buses/buses.module';
import { DriversModule } from './drivers/drivers.module';
import { HealthModule } from './health/health.module';
import { PhotosModule } from './photos/photos.module';
import { PrismaModule } from './prisma/prisma.module';
import { PrismaService } from './prisma/prisma.service';
import { RoutesModule } from './routes/routes.module';
import { TripsModule } from './trips/trips.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({ pinoHttp: httpLoggerOptions() }),
    HealthModule,
    AvailabilityModule,
    BranchesModule,
    BusesModule,
    DriversModule,
    RoutesModule,
    TripsModule,
    PrismaModule,
    PhotosModule,
    MessagingModule.forRoot({
      service: 'flota',
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
