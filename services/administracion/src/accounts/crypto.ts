import { createHash, randomBytes } from 'node:crypto';
import { argon2id, hash, verify } from 'argon2';

let decoyHash: Promise<string> | undefined;

export function hashPassword(password: string): Promise<string> {
  return hash(password, { type: argon2id });
}

// A missing hash still costs one verification, so response times do not reveal accounts.
export async function verifyPassword(stored: string | null, password: string): Promise<boolean> {
  if (stored) return verify(stored, password);
  decoyHash ??= hashPassword(randomBytes(16).toString('hex'));
  await verify(await decoyHash, password);
  return false;
}

export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateOpaqueToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashOpaqueToken(token) };
}
