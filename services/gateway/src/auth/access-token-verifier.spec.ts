import { generateKeyPairSync } from 'node:crypto';
import { ACCESS_TOKEN_AUDIENCE, ACCESS_TOKEN_ISSUER } from '@debus/contracts';
import { JwtService } from '@nestjs/jwt';
import { AccessTokenVerifier } from './access-token-verifier';

const pair = () =>
  generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
const keys = pair();
const sub = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
// An option set to undefined is left out, so a claim can be omitted from the token.
const sign = (payload: object, options: object = {}, privateKey = keys.privateKey) =>
  new JwtService({ privateKey }).sign(
    payload,
    Object.fromEntries(
      Object.entries({
        algorithm: 'RS256',
        expiresIn: 900,
        subject: sub,
        issuer: ACCESS_TOKEN_ISSUER,
        audience: ACCESS_TOKEN_AUDIENCE,
        ...options,
      }).filter(([, value]) => value !== undefined),
    ),
  );
const verifier = new AccessTokenVerifier({ jwtPublicKey: keys.publicKey } as never);

describe('AccessTokenVerifier', () => {
  it('returns the claims of a valid token', () => {
    expect(verifier.verify(sign({ role: 'CLIENT', branchId: null }))).toEqual({
      sub,
      role: 'CLIENT',
      branchId: null,
    });
  });

  it('rejects tokens signed with another key, expired or with unknown roles', () => {
    const otherKey = pair().privateKey;

    expect(verifier.verify(sign({ role: 'CLIENT', branchId: null }, {}, otherKey))).toBeNull();
    expect(
      verifier.verify(sign({ role: 'CLIENT', branchId: null }, { expiresIn: -10 })),
    ).toBeNull();
    expect(verifier.verify(sign({ role: 'KING', branchId: null }))).toBeNull();
    expect(verifier.verify('not-a-token')).toBeNull();
  });

  it('rejects tokens without the expected claims', () => {
    expect(verifier.verify(sign({ role: 'CLIENT' }))).toBeNull();
    expect(
      verifier.verify(sign({ role: 'CLIENT', branchId: null }, { subject: 'not-a-uuid' })),
    ).toBeNull();
  });

  it('refuses symmetric algorithms signed with the public key', () => {
    const forged = new JwtService({ secret: keys.publicKey }).sign(
      { role: 'SYSTEM_ADMIN', branchId: null },
      { algorithm: 'HS256', subject: sub },
    );

    expect(verifier.verify(forged)).toBeNull();
  });

  it('refuses tokens signed with the right key but another asymmetric algorithm', () => {
    for (const algorithm of ['RS512', 'PS256'] as const) {
      const token = sign({ role: 'SYSTEM_ADMIN', branchId: null }, { algorithm });

      expect(verifier.verify(token)).toBeNull();
    }
  });

  it('requires an expiry, an issuer and an audience', () => {
    const noExpiry = sign({ role: 'CLIENT', branchId: null }, { expiresIn: undefined });

    expect(verifier.verify(noExpiry)).toBeNull();
    expect(
      verifier.verify(sign({ role: 'CLIENT', branchId: null }, { issuer: undefined })),
    ).toBeNull();
    expect(
      verifier.verify(sign({ role: 'CLIENT', branchId: null }, { audience: undefined })),
    ).toBeNull();
    expect(
      verifier.verify(sign({ role: 'CLIENT', branchId: null }, { issuer: 'someone-else' })),
    ).toBeNull();
    expect(
      verifier.verify(sign({ role: 'CLIENT', branchId: null }, { audience: 'another-app' })),
    ).toBeNull();
  });

  it('refuses unsigned tokens', () => {
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const unsigned = `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ sub, role: 'SYSTEM_ADMIN', branchId: null })}.`;

    expect(verifier.verify(unsigned)).toBeNull();
  });
});
