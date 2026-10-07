import { MessagingModule, SqlInboxStore, correlationIdFor } from '@debus/messaging';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { PrismaService } from './prisma/prisma.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({
      pinoHttp: { level: process.env.LOG_LEVEL ?? 'info', genReqId: correlationIdFor },
    }),
    HealthModule,
    PrismaModule,
    MessagingModule.forRoot({
      service: 'administracion',
      inbox: {
        inject: [PrismaService],
        useFactory: (prisma: PrismaService) => new SqlInboxStore(prisma),
      },
    }),
  ],
})
export class AppModule {}
