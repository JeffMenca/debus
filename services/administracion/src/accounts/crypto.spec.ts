import { generateOpaqueToken, hashOpaqueToken, hashPassword, verifyPassword } from './crypto';

describe('passwords', () => {
  it('hashes with argon2id and verifies', async () => {
    const hash = await hashPassword('clave-segura-1');

    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(await verifyPassword(hash, 'clave-segura-1')).toBe(true);
    expect(await verifyPassword(hash, 'otra')).toBe(false);
  });

  it('answers false for accounts without a password', async () => {
    expect(await verifyPassword(null, 'lo-que-sea')).toBe(false);
  });
});

describe('opaque tokens', () => {
  it('creates 256 bit url safe tokens stored only as SHA-256', () => {
    const { token, hash } = generateOpaqueToken();

    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashOpaqueToken(token)).toBe(hash);
    expect(generateOpaqueToken().token).not.toBe(token);
  });
});
