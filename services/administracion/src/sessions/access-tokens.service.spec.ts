import { generateKeyPairSync } from 'node:crypto';
import {
  ACCESS_TOKEN_AUDIENCE,
  ACCESS_TOKEN_ISSUER,
  accessTokenClaimsSchema,
} from '@debus/contracts';
import { JwtService } from '@nestjs/jwt';
import { AccessTokensService, jwtModuleOptions } from './access-tokens.service';

function rsaKeyPair(): { privateKey: string; publicKey: string } {
  return generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
}

const { privateKey, publicKey } = rsaKeyPair();

describe('AccessTokensService', () => {
  const signer = new AccessTokensService(
    new JwtService(jwtModuleOptions({ privateKey, webUrl: 'w', bootstrapAdminEmail: null })),
  );
  const user = {
    id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    role: 'BRANCH_ADMIN' as const,
    branchId: '9b2c7a10-1111-4c4c-8888-123456789abc',
  };

  it('signs RS256 tokens that only the public key verifies', () => {
    const token = signer.sign(user);
    const verifier = new JwtService({ publicKey, verifyOptions: { algorithms: ['RS256'] } });
    const claims = verifier.verify<Record<string, unknown>>(token);

    expect(claims).toMatchObject({ iss: 'debus-administracion', aud: 'debus' });
    expect(ACCESS_TOKEN_ISSUER).toBe('debus-administracion');
    expect(ACCESS_TOKEN_AUDIENCE).toBe('debus');
    expect(accessTokenClaimsSchema.parse(claims)).toEqual({
      sub: user.id,
      role: 'BRANCH_ADMIN',
      branchId: user.branchId,
    });
    expect((claims.exp as number) - (claims.iat as number)).toBe(900);
  });

  it('is rejected under another key', () => {
    const verifier = new JwtService({
      publicKey: rsaKeyPair().publicKey,
      verifyOptions: { algorithms: ['RS256'] },
    });

    expect(() => verifier.verify(signer.sign(user))).toThrow();
  });
});
