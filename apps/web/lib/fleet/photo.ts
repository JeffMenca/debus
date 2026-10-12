import { PHOTO_MAX_BYTES, PHOTO_TYPES } from '@debus/contracts';

// The same sentence the service answers with, so the person reads one message wherever it fails.
export const PHOTO_MESSAGE = 'Sube una foto JPG, PNG o WebP de hasta 5 MB.';

export const PHOTO_ACCEPT = PHOTO_TYPES.join(',');

export function photoError(file: File): string | undefined {
  const allowed = (PHOTO_TYPES as readonly string[]).includes(file.type);
  return allowed && file.size <= PHOTO_MAX_BYTES ? undefined : PHOTO_MESSAGE;
}
