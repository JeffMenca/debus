import { PHOTO_MAX_BYTES } from '@debus/contracts';
import { BadRequestException, UseFilters, UseInterceptors, applyDecorators } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOkResponse } from '@nestjs/swagger';
import type { Response } from 'express';
import { apiErrors } from '@debus/server';
import { FLEET_MESSAGES } from '../common/messages';
import { type PhotoType, imageTypeOf } from './image-type';
import type { StoredPhoto } from './photo-storage';
import { PhotoTooLargeFilter } from './photo-too-large.filter';

export const photoUpload = () =>
  applyDecorators(
    UseInterceptors(FileInterceptor('photo', { limits: { fileSize: PHOTO_MAX_BYTES, files: 1 } })),
    UseFilters(PhotoTooLargeFilter),
    ApiConsumes('multipart/form-data'),
    ApiBody({
      schema: { type: 'object', properties: { photo: { type: 'string', format: 'binary' } } },
    }),
  );

// GET of a photo: the answer is an image, not JSON, so the 200 is described by hand.
export const photoDownload = () =>
  applyDecorators(
    ApiOkResponse({
      description: 'The photo.',
      content: { 'image/*': { schema: { type: 'string', format: 'binary' } } },
    }),
    apiErrors(404),
  );

// What multer hands over (memory storage); only the bytes matter here.
export interface UploadedPhotoFile {
  buffer: Buffer;
}

export interface NewPhoto {
  data: Buffer;
  contentType: PhotoType;
}

export function photoFrom(file?: UploadedPhotoFile): NewPhoto {
  const contentType = file ? imageTypeOf(file.buffer) : null;
  if (!file || !contentType) throw new BadRequestException(FLEET_MESSAGES.photoInvalid);
  return { data: file.buffer, contentType };
}

export function sendPhoto(res: Response, photo: StoredPhoto): void {
  res
    .set({ 'content-type': photo.contentType, 'cache-control': 'private, max-age=300' })
    .send(photo.data);
}
