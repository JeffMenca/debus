import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { MessagingSettings } from '../settings';
import { MESSAGING_SETTINGS, OIDC_VERIFIER } from '../tokens';

export interface OidcVerifier {
  verifyIdToken(options: { idToken: string; audience: string }): Promise<{
    getPayload(): { email?: string; email_verified?: boolean } | undefined;
  }>;
}

// Pub/Sub signs each push with the pubsub-invoker account; the emulator sends no token.
@Injectable()
export class PubSubPushGuard implements CanActivate {
  constructor(
    @Inject(MESSAGING_SETTINGS) private readonly settings: MessagingSettings,
    @Inject(OIDC_VERIFIER) private readonly verifier: OidcVerifier,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.settings.emulator) return true;
    const { audience, pushServiceAccount } = this.settings;
    const request = context.switchToHttp().getRequest<{ headers: { authorization?: string } }>();
    const [scheme, token] = (request.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token || !audience || !pushServiceAccount) {
      throw new UnauthorizedException();
    }
    try {
      const ticket = await this.verifier.verifyIdToken({ idToken: token, audience });
      const payload = ticket.getPayload();
      if (payload?.email === pushServiceAccount && payload.email_verified) return true;
    } catch {
      // An unverifiable token is rejected below.
    }
    throw new UnauthorizedException();
  }
}
