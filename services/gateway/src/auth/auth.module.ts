import { type MiddlewareConsumer, Module, type NestModule, RequestMethod } from '@nestjs/common';
import { AccessTokenVerifier } from './access-token-verifier';
import { AuthMiddleware } from './auth.middleware';

@Module({ providers: [AccessTokenVerifier] })
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Every route, so identity headers are cleaned even on paths that are not proxied.
    consumer.apply(AuthMiddleware).forRoutes({ path: '{*path}', method: RequestMethod.ALL });
  }
}
