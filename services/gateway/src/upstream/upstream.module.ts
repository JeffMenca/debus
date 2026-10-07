import { Global, Module } from '@nestjs/common';
import { GatewayConfig, loadGatewayConfig } from '../config/gateway-config';
import { ID_TOKEN_SOURCE, IdentityTokens, googleIdTokenSource } from './identity-tokens';
import { ServiceClient } from './service-client';

@Global()
@Module({
  providers: [
    { provide: GatewayConfig, useFactory: () => loadGatewayConfig(process.env) },
    { provide: ID_TOKEN_SOURCE, useFactory: googleIdTokenSource },
    IdentityTokens,
    ServiceClient,
  ],
  exports: [GatewayConfig, IdentityTokens, ServiceClient],
})
export class UpstreamModule {}
