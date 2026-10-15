import { createHash } from 'node:crypto';

// The same text always gives the same UUID, so a record the seed creates twice is the same record.
export function uuidFrom(text: string): string {
  const hex = createHash('sha1').update(text).digest('hex');
  const variant = ((parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `5${hex.slice(13, 16)}`,
    `${variant}${hex.slice(18, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}
