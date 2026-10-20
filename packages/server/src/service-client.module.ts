import { type DynamicModule, Module } from '@nestjs/common';
import {
  ID_TOKEN_SOURCE,
  IdentityTokens,
  SERVICE_AUTH_OPTIONS,
  googleIdTokenSource,
} from './identity-tokens';
import { circuitOptionsFromEnv } from './circuit-breaker';
import { ServiceHttpClient, serviceUrlsFromEnv } from './service-client';

export const serviceClientFromEnv = (
  tokens: Pick<IdentityTokens, 'headersFor'>,
  env: Record<string, string | undefined>,
): ServiceHttpClient =>
  new ServiceHttpClient(tokens, serviceUrlsFromEnv(env), { circuit: circuitOptionsFromEnv(env) });

// One call in the AppModule of a service that calls peers: URLs and auth come from its environment.
@Module({})
export class ServiceClientModule {
  static forRoot(): DynamicModule {
    return {
      module: ServiceClientModule,
      global: true,
      providers: [
        {
          provide: SERVICE_AUTH_OPTIONS,
          useFactory: () => ({
            serviceAuth: process.env.SERVICE_AUTH === 'google' ? 'google' : 'none',
          }),
        },
        { provide: ID_TOKEN_SOURCE, useFactory: googleIdTokenSource },
        IdentityTokens,
        {
          provide: ServiceHttpClient,
          inject: [IdentityTokens],
          useFactory: (tokens: IdentityTokens) => serviceClientFromEnv(tokens, process.env),
        },
      ],
      exports: [ServiceHttpClient],
    };
  }
}
