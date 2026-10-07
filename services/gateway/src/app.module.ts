import { MessagingModule, correlationIdFor } from '@debus/messaging';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { HealthModule } from './health/health.module';
import { ProxyModule } from './proxy/proxy.module';
import { SystemModule } from './system/system.module';
import { UpstreamModule } from './upstream/upstream.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({
      pinoHttp: { level: process.env.LOG_LEVEL ?? 'info', genReqId: correlationIdFor },
    }),
    MessagingModule.forRoot({ service: 'gateway' }),
    UpstreamModule,
    HealthModule,
    SystemModule,
    ProxyModule,
  ],
})
export class AppModule {}
