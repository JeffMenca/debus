import { CORRELATION_HEADER, type RepublishResult } from '@debus/contracts';
import { apiSuccess } from '@debus/server';
import { Controller, Headers, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SettingsRepublishService } from './settings-republish.service';

// For a deploy that adds a service which keeps a copy of the settings: called once with the identity
// token of the deploy, never by a user, and the gateway never publishes this path. The settings are
// global, so there is no branch filter.
@ApiTags('internal')
@Controller('internal/settings')
export class SettingsRepublishController {
  constructor(private readonly settings: SettingsRepublishService) {}

  @Post('republish')
  @HttpCode(200)
  @apiSuccess(200)
  republish(@Headers(CORRELATION_HEADER) correlationId?: string): Promise<RepublishResult> {
    return this.settings.republish(correlationId);
  }
}
