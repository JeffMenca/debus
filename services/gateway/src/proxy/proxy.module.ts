import { type MiddlewareConsumer, Module, type NestModule, RequestMethod } from '@nestjs/common';
import { ProxyMiddleware } from './proxy.middleware';

@Module({ providers: [ProxyMiddleware] })
export class ProxyModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(ProxyMiddleware)
      .exclude({ path: 'api/sistema{/*path}', method: RequestMethod.ALL })
      .forRoutes({ path: 'api{/*path}', method: RequestMethod.ALL });
  }
}
