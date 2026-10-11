import {
  CORRELATION_HEADER,
  type CreateSettingsRequest,
  type SettingsOverview,
  type SettingsVersion,
  createSettingsRequestSchema,
} from '@debus/contracts';
import { Body, Controller, Get, Headers, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { apiErrors, apiSuccess } from '../common/api-errors';
import { ZodBody, apiBody } from '../common/zod-body.pipe';
import { CurrentIdentity, type Identity, Roles } from '../identity/identity';
import { SettingsService } from './settings.service';

@ApiTags('settings')
@ApiBearerAuth()
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @apiSuccess(200)
  @Roles('SYSTEM_ADMIN')
  overview(): Promise<SettingsOverview> {
    return this.settings.overview();
  }

  @Post()
  @apiSuccess(201)
  @Roles('SYSTEM_ADMIN')
  @apiErrors(400)
  @apiBody(createSettingsRequestSchema)
  create(
    @CurrentIdentity() actor: Identity,
    @Body(new ZodBody(createSettingsRequestSchema)) body: CreateSettingsRequest,
    @Headers(CORRELATION_HEADER) correlationId?: string,
  ): Promise<SettingsVersion> {
    return this.settings.create(actor, body, correlationId);
  }
}
