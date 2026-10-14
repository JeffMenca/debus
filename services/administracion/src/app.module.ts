import { MessagingModule, SqlInboxStore, httpLoggerOptions } from '@debus/messaging';
import { HttpExceptionFilter, RolesGuard } from '@debus/server';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { AccountsModule } from './accounts/accounts.module';
import { BranchesModule } from './branches/branches.module';
import { DriversModule } from './drivers/drivers.module';
import { ExpensesModule } from './expenses/expenses.module';
import { FleetModule } from './fleet/fleet.module';
import { HealthModule } from './health/health.module';
import { SessionsModule } from './sessions/sessions.module';
import { SettingsModule } from './settings/settings.module';
import { UsersModule } from './users/users.module';
import { PrismaModule } from './prisma/prisma.module';
import { PrismaService } from './prisma/prisma.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({ pinoHttp: httpLoggerOptions() }),
    HealthModule,
    AccountsModule,
    BranchesModule,
    DriversModule,
    ExpensesModule,
    FleetModule,
    SessionsModule,
    SettingsModule,
    UsersModule,
    PrismaModule,
    MessagingModule.forRoot({
      service: 'administracion',
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
