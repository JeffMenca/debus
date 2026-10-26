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

// A stable number in [0, 1) for a text, so the seed can decide "for about a third of the trips"
// without a random generator: the same trip always falls on the same side.
export function fraction(text: string): number {
  return parseInt(createHash('sha1').update(text).digest('hex').slice(0, 8), 16) / 0x1_0000_0000;
}
