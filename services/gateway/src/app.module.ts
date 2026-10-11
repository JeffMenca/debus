import { MessagingModule, httpLoggerOptions } from '@debus/messaging';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { AuthModule } from './auth/auth.module';
import { DocsModule } from './docs/docs.module';
import { HealthModule } from './health/health.module';
import { ProxyModule } from './proxy/proxy.module';
import { SystemModule } from './system/system.module';
import { UpstreamModule } from './upstream/upstream.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({ pinoHttp: httpLoggerOptions() }),
    MessagingModule.forRoot({ service: 'gateway' }),
    UpstreamModule,
    AuthModule,
    HealthModule,
    DocsModule,
    SystemModule,
    ProxyModule,
  ],
})
export class AppModule {}
