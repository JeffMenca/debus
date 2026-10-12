import { NotFoundException } from '@nestjs/common';
import { FLEET_MESSAGES } from '../common/messages';
import { type PhotoStorage, type StoredPhoto, photoKeyFor } from './photo-storage';
import type { NewPhoto } from './photo-upload';

interface PhotoReplacement {
  kind: 'buses' | 'drivers';
  id: string;
  previousKey: string | null;
  photo: NewPhoto;
  // Points the row of the bus or driver at the stored object.
  point: (photoKey: string) => Promise<unknown>;
}

export async function replacePhoto(
  storage: PhotoStorage,
  { kind, id, previousKey, photo, point }: PhotoReplacement,
): Promise<void> {
  const key = photoKeyFor(kind, id);
  await storage.save(key, photo.data, photo.contentType);
  await point(key);
  // The old object goes only after the row points at the new one.
  if (previousKey) await storage.remove(previousKey);
}

export async function readSavedPhoto(
  storage: PhotoStorage,
  key: string | null,
): Promise<StoredPhoto> {
  const photo = key ? await storage.read(key) : null;
  if (!photo) throw new NotFoundException(FLEET_MESSAGES.photoMissing);
  return photo;
}
