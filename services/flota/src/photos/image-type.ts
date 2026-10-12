import type { PHOTO_TYPES } from '@debus/contracts';

export type PhotoType = (typeof PHOTO_TYPES)[number];

const startsWith = (buffer: Buffer, signature: number[], offset = 0) =>
  signature.every((byte, index) => buffer[offset + index] === byte);

// The browser's file name and type are only a hint; the bytes decide.
export function imageTypeOf(buffer: Buffer): PhotoType | null {
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return null;
}
