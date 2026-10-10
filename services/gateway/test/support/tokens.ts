import { generateKeyPairSync } from 'node:crypto';
import { ACCESS_TOKEN_AUDIENCE, ACCESS_TOKEN_ISSUER, type UserRole } from '@debus/contracts';
import { JwtService } from '@nestjs/jwt';

const DEFAULT_SUBJECT = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
let privateKey = '';

// The gateway loads the public key from the environment, like in production.
export function useTestKeys(): void {
  const pair = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  privateKey = pair.privateKey;
  process.env.JWT_PUBLIC_KEY = pair.publicKey;
}

export function bearer(
  claims: { role: UserRole; branchId?: string | null; sub?: string },
  options: { expiresIn?: number } = {},
): string {
  const token = new JwtService({ privateKey }).sign(
    { role: claims.role, branchId: claims.branchId ?? null },
    {
      algorithm: 'RS256',
      expiresIn: options.expiresIn ?? 900,
      subject: claims.sub ?? DEFAULT_SUBJECT,
      issuer: ACCESS_TOKEN_ISSUER,
      audience: ACCESS_TOKEN_AUDIENCE,
    },
  );
  return `Bearer ${token}`;
}
