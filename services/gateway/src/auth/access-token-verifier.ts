import {
  ACCESS_TOKEN_AUDIENCE,
  ACCESS_TOKEN_ISSUER,
  type AccessTokenClaims,
  accessTokenClaimsSchema,
} from '@debus/contracts';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { GatewayConfig } from '../config/gateway-config';

@Injectable()
export class AccessTokenVerifier {
  private readonly jwt: JwtService;

  constructor(config: GatewayConfig) {
    // The gateway only holds the public key, so it can verify tokens but never sign them.
    this.jwt = new JwtService({
      publicKey: config.jwtPublicKey,
      verifyOptions: {
        algorithms: ['RS256'],
        issuer: ACCESS_TOKEN_ISSUER,
        audience: ACCESS_TOKEN_AUDIENCE,
      },
    });
  }

  verify(token: string): AccessTokenClaims | null {
    try {
      const payload = this.jwt.verify<{ exp?: unknown }>(token);
      // jsonwebtoken accepts tokens without an expiry; a session token must always expire.
      if (typeof payload.exp !== 'number') return null;
      const parsed = accessTokenClaimsSchema.safeParse(payload);
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }
}
