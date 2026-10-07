import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { MessagingSettings } from '../settings';
import { type OidcVerifier, PubSubPushGuard } from './pubsub-push.guard';

const cloud: MessagingSettings = {
  service: 'flota',
  environment: 'production',
  projectId: 'p',
  emulator: false,
  audience: 'https://flota-1.r.run.app',
  pushServiceAccount: 'pubsub-invoker@p.iam.gserviceaccount.com',
};

function context(authorization?: string): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers: { authorization } }) }),
  } as unknown as ExecutionContext;
}

function verifier(payload: { email?: string; email_verified?: boolean } | Error): OidcVerifier {
  return {
    verifyIdToken: jest.fn(() =>
      payload instanceof Error
        ? Promise.reject(payload)
        : Promise.resolve({ getPayload: () => payload }),
    ),
  };
}

const valid = { email: 'pubsub-invoker@p.iam.gserviceaccount.com', email_verified: true };

describe('PubSubPushGuard', () => {
  it('lets every request through when the emulator is in use', async () => {
    const guard = new PubSubPushGuard({ ...cloud, emulator: true }, verifier(new Error('unused')));

    await expect(guard.canActivate(context())).resolves.toBe(true);
  });

  it('accepts a token from the push service account for this audience', async () => {
    const oidc = verifier(valid);

    await expect(new PubSubPushGuard(cloud, oidc).canActivate(context('Bearer t'))).resolves.toBe(
      true,
    );
    expect(oidc.verifyIdToken).toHaveBeenCalledWith({ idToken: 't', audience: cloud.audience });
  });

  it.each([
    ['no header', undefined, verifier(valid)],
    [
      'another account',
      'Bearer t',
      verifier({ email: 'x@p.iam.gserviceaccount.com', email_verified: true }),
    ],
    ['an invalid token', 'Bearer t', verifier(new Error('bad'))],
  ])('rejects %s', async (_case, header, oidc) => {
    await expect(new PubSubPushGuard(cloud, oidc).canActivate(context(header))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects everything when the audience is not configured', async () => {
    const withoutAudience: MessagingSettings = { ...cloud };
    delete withoutAudience.audience;
    const guard = new PubSubPushGuard(withoutAudience, verifier(valid));

    await expect(guard.canActivate(context('Bearer t'))).rejects.toThrow(UnauthorizedException);
  });
});
