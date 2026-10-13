import {
  CORRELATION_HEADER,
  type Driver,
  type DriverFields,
  type DriverListQuery,
  type DriverPage,
  driverFieldsSchema,
  driverListQuerySchema,
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
import { DriversService } from './drivers.service';

@ApiTags('drivers')
@ApiBearerAuth()
@Roles('BRANCH_ADMIN')
@Controller('drivers')
export class DriversController {
  constructor(private readonly drivers: DriversService) {}

  @Get()
  @apiSuccess(200)
  @apiErrors(400)
  @apiQuery(driverListQuerySchema)
  list(
    @CurrentIdentity() actor: Identity,
    @Query(new ZodBody(driverListQuerySchema)) query: DriverListQuery,
  ): Promise<DriverPage> {
    return this.drivers.list(requireBranch(actor), query);
  }

  @Get(':id')
  @apiSuccess(200)
  @apiErrors(404)
  get(
    @CurrentIdentity() actor: Identity,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<Driver> {
    return this.drivers.get(requireBranch(actor), id);
  }

  @Post()
  @apiSuccess(201)
  @apiErrors(400, 409)
  @apiBody(driverFieldsSchema)
  create(
    @CurrentIdentity() actor: Identity,
    @Body(new ZodBody(driverFieldsSchema)) body: DriverFields,
    @Headers(CORRELATION_HEADER) correlationId?: string,
  ): Promise<Driver> {
    return this.drivers.create(requireBranch(actor), body, correlationId);
  }

  @Patch(':id')
  @apiSuccess(200)
  @apiErrors(400, 404, 409)
  @apiBody(driverFieldsSchema)
  update(
    @CurrentIdentity() actor: Identity,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodBody(driverFieldsSchema)) body: DriverFields,
    @Headers(CORRELATION_HEADER) correlationId?: string,
  ): Promise<Driver> {
    return this.drivers.update(requireBranch(actor), id, body, correlationId);
  }

  @Post(':id/deactivate')
  @apiSuccess(204)
  @apiErrors(404, 409)
  deactivate(
    @CurrentIdentity() actor: Identity,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers(CORRELATION_HEADER) correlationId?: string,
  ): Promise<void> {
    return this.drivers.setActive(requireBranch(actor), id, false, correlationId);
  }

  @Post(':id/reactivate')
  @apiSuccess(204)
  @apiErrors(404)
  reactivate(
    @CurrentIdentity() actor: Identity,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers(CORRELATION_HEADER) correlationId?: string,
  ): Promise<void> {
    return this.drivers.setActive(requireBranch(actor), id, true, correlationId);
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
    return this.drivers.savePhoto(requireBranch(actor), id, photoFrom(file));
  }

  @Get(':id/photo')
  @photoDownload()
  async photo(
    @CurrentIdentity() actor: Identity,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res() res: Response,
  ): Promise<void> {
    sendPhoto(res, await this.drivers.readPhoto(requireBranch(actor), id));
  }
}
