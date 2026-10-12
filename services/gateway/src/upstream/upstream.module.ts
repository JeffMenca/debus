import {
  ID_TOKEN_SOURCE,
  IdentityTokens,
  SERVICE_AUTH_OPTIONS,
  googleIdTokenSource,
} from '@debus/server';
import { Global, Module } from '@nestjs/common';
import { GatewayConfig, loadGatewayConfig } from '../config/gateway-config';
import { ServiceClient } from './service-client';

@Global()
@Module({
  providers: [
    { provide: GatewayConfig, useFactory: () => loadGatewayConfig(process.env) },
    {
      provide: SERVICE_AUTH_OPTIONS,
      inject: [GatewayConfig],
      useFactory: (config: GatewayConfig) => ({ serviceAuth: config.serviceAuth }),
    },
    { provide: ID_TOKEN_SOURCE, useFactory: googleIdTokenSource },
    IdentityTokens,
    ServiceClient,
  ],
  exports: [GatewayConfig, IdentityTokens, ServiceClient],
})
export class UpstreamModule {}
