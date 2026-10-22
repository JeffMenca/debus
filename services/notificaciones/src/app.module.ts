import { MessagingModule, SqlInboxStore, httpLoggerOptions } from '@debus/messaging';
import { HttpExceptionFilter, RolesGuard } from '@debus/server';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { AccountLinksModule } from './account-links/account-links.module';
import { HealthModule } from './health/health.module';
import { LicenseAlertsModule } from './license-alerts/license-alerts.module';
import { EmailQueueModule } from './mail/email-queue.module';
import { MailModule } from './mail/mail.module';
import { PrismaModule } from './prisma/prisma.module';
import { PrismaService } from './prisma/prisma.service';
import { RentalsModule } from './rentals/rentals.module';
import { StaffModule } from './staff/staff.module';
import { TicketsModule } from './tickets/tickets.module';
import { WalletModule } from './wallet/wallet.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({ pinoHttp: httpLoggerOptions() }),
    HealthModule,
    PrismaModule,
    MailModule,
    EmailQueueModule,
    AccountLinksModule,
    TicketsModule,
    WalletModule,
    RentalsModule,
    StaffModule,
    LicenseAlertsModule,
    MessagingModule.forRoot({
      service: 'notificaciones',
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
