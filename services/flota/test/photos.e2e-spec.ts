import { randomUUID } from 'node:crypto';
import { GcsPhotoStorage } from '../src/photos/photo-storage';

describe('photo storage against the local bucket', () => {
  const storage = GcsPhotoStorage.fromEnv(process.env);
  const key = `test/${randomUUID()}`;
  afterAll(() => storage.remove(key));

  it('saves, reads and removes a photo', async () => {
    await storage.save(key, Buffer.from([0xff, 0xd8, 0xff, 1]), 'image/jpeg');
    expect(await storage.read(key)).toEqual({
      data: Buffer.from([0xff, 0xd8, 0xff, 1]),
      contentType: 'image/jpeg',
    });
    await storage.remove(key);
    expect(await storage.read(key)).toBeNull();
  });
});
