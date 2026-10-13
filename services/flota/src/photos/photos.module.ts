import { Global, Module } from '@nestjs/common';
import { GcsPhotoStorage, PHOTO_STORAGE } from './photo-storage';

@Global()
@Module({
  providers: [{ provide: PHOTO_STORAGE, useFactory: () => GcsPhotoStorage.fromEnv(process.env) }],
  exports: [PHOTO_STORAGE],
})
export class PhotosModule {}
