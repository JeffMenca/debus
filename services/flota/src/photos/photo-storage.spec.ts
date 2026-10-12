import type { Storage } from '@google-cloud/storage';
import { GcsPhotoStorage, photoKeyFor } from './photo-storage';

function storageWith(file: Record<string, jest.Mock>) {
  const bucket = jest.fn().mockReturnValue({ file: jest.fn().mockReturnValue(file) });
  return { storage: { bucket } as unknown as Storage, bucket };
}

describe('GcsPhotoStorage', () => {
  it('saves the bytes with their content type, in one request', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const { storage, bucket } = storageWith({ save });

    await new GcsPhotoStorage(storage, 'media').save('buses/1/a', Buffer.from('x'), 'image/png');

    expect(bucket).toHaveBeenCalledWith('media');
    expect(save).toHaveBeenCalledWith(Buffer.from('x'), {
      contentType: 'image/png',
      resumable: false,
    });
  });

  it('reads the bytes and the content type', async () => {
    const { storage } = storageWith({
      download: jest.fn().mockResolvedValue([Buffer.from('img')]),
      getMetadata: jest.fn().mockResolvedValue([{ contentType: 'image/jpeg' }]),
    });

    await expect(new GcsPhotoStorage(storage, 'media').read('k')).resolves.toEqual({
      data: Buffer.from('img'),
      contentType: 'image/jpeg',
    });
  });

  it('falls back to a binary type when the object has none', async () => {
    const { storage } = storageWith({
      download: jest.fn().mockResolvedValue([Buffer.from('img')]),
      getMetadata: jest.fn().mockResolvedValue([{}]),
    });

    await expect(new GcsPhotoStorage(storage, 'media').read('k')).resolves.toMatchObject({
      contentType: 'application/octet-stream',
    });
  });

  it('answers null for a missing object and rethrows any other failure', async () => {
    const missing = storageWith({
      download: jest.fn().mockRejectedValue({ code: 404 }),
      getMetadata: jest.fn().mockRejectedValue({ code: 404 }),
    });
    await expect(new GcsPhotoStorage(missing.storage, 'media').read('k')).resolves.toBeNull();

    const broken = storageWith({
      download: jest.fn().mockRejectedValue(new Error('boom')),
      getMetadata: jest.fn().mockResolvedValue([{}]),
    });
    await expect(new GcsPhotoStorage(broken.storage, 'media').read('k')).rejects.toThrow('boom');
  });

  it('removes an object and does not mind that it is gone', async () => {
    const remove = jest.fn().mockResolvedValue(undefined);
    const { storage } = storageWith({ delete: remove });

    await new GcsPhotoStorage(storage, 'media').remove('k');

    expect(remove).toHaveBeenCalledWith({ ignoreNotFound: true });
  });

  it('needs the bucket name from the environment', () => {
    expect(() => GcsPhotoStorage.fromEnv({})).toThrow('MEDIA_BUCKET is not set');
    expect(GcsPhotoStorage.fromEnv({ MEDIA_BUCKET: 'm' })).toBeInstanceOf(GcsPhotoStorage);
    expect(
      GcsPhotoStorage.fromEnv({
        MEDIA_BUCKET: 'm',
        MEDIA_EMULATOR_URL: 'http://localhost:4443',
      }),
    ).toBeInstanceOf(GcsPhotoStorage);
  });
});

describe('photoKeyFor', () => {
  it('builds a different key every time under the owner folder', () => {
    const id = '1f0e2d3c-4b5a-4968-8776-655443322110';
    const first = photoKeyFor('buses', id);

    expect(first).toMatch(new RegExp(`^buses/${id}/[0-9a-f-]{36}$`));
    expect(photoKeyFor('buses', id)).not.toBe(first);
    expect(photoKeyFor('drivers', id)).toMatch(/^drivers\//);
  });
});
