import {
  type Bus,
  type BusFields,
  type BusListQuery,
  type BusPage,
  CORRELATION_HEADER,
  busFieldsSchema,
  busListQuerySchema,
} from '@debus/contracts';
import {
  CurrentIdentity,
  type Identity,
  Roles,
  ZodBody,
  apiBody,
  apiErrors,
  apiQuery,
  apiSuccess,
  requireBranch,
} from '@debus/server';
import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  type UploadedPhotoFile,
  photoDownload,
  photoFrom,
  photoUpload,
  sendPhoto,
} from '../photos/photo-upload';
import { BusesService } from './buses.service';

@ApiTags('buses')
@ApiBearerAuth()
@Roles('BRANCH_ADMIN')
@Controller('buses')
export class BusesController {
  constructor(private readonly buses: BusesService) {}

  @Get()
  @apiSuccess(200)
  @apiErrors(400)
  @apiQuery(busListQuerySchema)
  list(
    @CurrentIdentity() actor: Identity,
    @Query(new ZodBody(busListQuerySchema)) query: BusListQuery,
  ): Promise<BusPage> {
    return this.buses.list(requireBranch(actor), query);
  }

  @Get(':id')
  @apiSuccess(200)
  @apiErrors(404)
  get(
    @CurrentIdentity() actor: Identity,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<Bus> {
    return this.buses.get(requireBranch(actor), id);
  }

  @Post()
  @apiSuccess(201)
  @apiErrors(400, 409)
  @apiBody(busFieldsSchema)
  create(
    @CurrentIdentity() actor: Identity,
    @Body(new ZodBody(busFieldsSchema)) body: BusFields,
    @Headers(CORRELATION_HEADER) correlationId?: string,
  ): Promise<Bus> {
    return this.buses.create(requireBranch(actor), body, correlationId);
  }

  @Patch(':id')
  @apiSuccess(200)
  @apiErrors(400, 404, 409)
  @apiBody(busFieldsSchema)
  update(
    @CurrentIdentity() actor: Identity,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodBody(busFieldsSchema)) body: BusFields,
    @Headers(CORRELATION_HEADER) correlationId?: string,
  ): Promise<Bus> {
    return this.buses.update(requireBranch(actor), id, body, correlationId);
  }

  @Post(':id/deactivate')
  @apiSuccess(204)
  @apiErrors(404, 409)
  deactivate(
    @CurrentIdentity() actor: Identity,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers(CORRELATION_HEADER) correlationId?: string,
  ): Promise<void> {
    return this.buses.setActive(requireBranch(actor), id, false, correlationId);
  }

  @Post(':id/reactivate')
  @apiSuccess(204)
  @apiErrors(404)
  reactivate(
    @CurrentIdentity() actor: Identity,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers(CORRELATION_HEADER) correlationId?: string,
  ): Promise<void> {
    return this.buses.setActive(requireBranch(actor), id, true, correlationId);
  }

  @Put(':id/photo')
  @apiSuccess(204)
  @apiErrors(400, 404)
  @photoUpload()
  savePhoto(
    @CurrentIdentity() actor: Identity,
    @Param('id', new ParseUUIDPipe()) id: string,
    @UploadedFile() file?: UploadedPhotoFile,
  ): Promise<void> {
    return this.buses.savePhoto(requireBranch(actor), id, photoFrom(file));
  }

  @Get(':id/photo')
  @photoDownload()
  async photo(
    @CurrentIdentity() actor: Identity,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res() res: Response,
  ): Promise<void> {
    sendPhoto(res, await this.buses.readPhoto(requireBranch(actor), id));
  }
}
