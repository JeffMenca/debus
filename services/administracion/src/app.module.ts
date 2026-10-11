import { MessagingModule, SqlInboxStore, httpLoggerOptions } from '@debus/messaging';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { AccountsModule } from './accounts/accounts.module';
import { BranchesModule } from './branches/branches.module';
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
})
export class AppModule {}
