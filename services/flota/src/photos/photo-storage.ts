import { randomUUID } from 'node:crypto';
import { Storage } from '@google-cloud/storage';

export const PHOTO_STORAGE = Symbol('PHOTO_STORAGE');

export interface StoredPhoto {
  data: Buffer;
  contentType: string;
}

export interface PhotoStorage {
  save(key: string, data: Buffer, contentType: string): Promise<void>;
  read(key: string): Promise<StoredPhoto | null>;
  remove(key: string): Promise<void>;
}

export const photoKeyFor = (kind: 'buses' | 'drivers', id: string): string =>
  `${kind}/${id}/${randomUUID()}`;

const isNotFound = (error: unknown) => (error as { code?: number }).code === 404;

export class GcsPhotoStorage implements PhotoStorage {
  constructor(
    private readonly storage: Storage,
    private readonly bucketName: string,
  ) {}

  // MEDIA_EMULATOR_URL points the client at fake-gcs-server locally; in Cloud Run the service
  // account of flota has objectAdmin on MEDIA_BUCKET (infra/gcp/bootstrap.sh). It is not named
  // STORAGE_EMULATOR_HOST: the library reads that one itself and then drops the /storage/v1 path.
  static fromEnv(env: NodeJS.ProcessEnv): GcsPhotoStorage {
    const bucket = env.MEDIA_BUCKET;
    if (!bucket) throw new Error('MEDIA_BUCKET is not set');
    const emulator = env.MEDIA_EMULATOR_URL;
    const storage = emulator
      ? new Storage({ apiEndpoint: emulator, projectId: 'debus-local' })
      : new Storage();
    return new GcsPhotoStorage(storage, bucket);
  }

  private file(key: string) {
    return this.storage.bucket(this.bucketName).file(key);
  }

  async save(key: string, data: Buffer, contentType: string): Promise<void> {
    await this.file(key).save(data, { contentType, resumable: false });
  }

  async read(key: string): Promise<StoredPhoto | null> {
    try {
      const file = this.file(key);
      const [[data], [metadata]] = await Promise.all([file.download(), file.getMetadata()]);
      return { data, contentType: metadata.contentType ?? 'application/octet-stream' };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async remove(key: string): Promise<void> {
    await this.file(key).delete({ ignoreNotFound: true });
  }
}
