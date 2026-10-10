import {
  ACCESS_TOKEN_AUDIENCE,
  ACCESS_TOKEN_ISSUER,
  ACCESS_TOKEN_TTL_SECONDS,
  type UserRole,
} from '@debus/contracts';
import { Injectable } from '@nestjs/common';
import { JwtService, type JwtModuleOptions } from '@nestjs/jwt';
import type { AuthSettings } from '../accounts/auth-settings';

export function jwtModuleOptions(settings: AuthSettings): JwtModuleOptions {
  return {
    privateKey: settings.privateKey,
    signOptions: {
      algorithm: 'RS256',
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      issuer: ACCESS_TOKEN_ISSUER,
      audience: ACCESS_TOKEN_AUDIENCE,
    },
  };
}

@Injectable()
export class AccessTokensService {
  constructor(private readonly jwt: JwtService) {}

  sign(user: { id: string; role: UserRole; branchId: string | null }): string {
    return this.jwt.sign({ role: user.role, branchId: user.branchId }, { subject: user.id });
  }
}
