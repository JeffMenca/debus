import {
  CORRELATION_HEADER,
  type ProbeCreated,
  type ProbeStatus,
  type SystemStatus,
} from '@debus/contracts';
import { Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ProbeService } from './probe.service';
import { SystemStatusService } from './system-status.service';

// The route guard already limits /api/system to system admins; the docs say so too.
const SystemAdminOnly = () => ApiOperation({ description: 'Allowed roles: SYSTEM_ADMIN.' });

@ApiTags('system')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing, invalid or expired session.' })
@ApiForbiddenResponse({ description: 'The role does not allow this action.' })
@Controller('api/system')
export class SystemController {
  constructor(
    private readonly status: SystemStatusService,
    private readonly probes: ProbeService,
  ) {}

  @Get('status')
  @SystemAdminOnly()
  @ApiOkResponse({ description: 'Health of the gateway and every service.' })
  check(@Headers(CORRELATION_HEADER) correlationId: string): Promise<SystemStatus> {
    return this.status.check(correlationId);
  }

  @Post('probes')
  @SystemAdminOnly()
  @HttpCode(202)
  @ApiAcceptedResponse({
    description: 'Probe accepted; its id is returned to follow the delivery.',
  })
  emit(@Headers(CORRELATION_HEADER) correlationId: string): Promise<ProbeCreated> {
    return this.probes.emit(correlationId);
  }

  @Get('probes/:probeId')
  @SystemAdminOnly()
  @ApiBadRequestResponse({ description: 'The probe id is not valid.' })
  @ApiOkResponse({ description: 'Which services received the probe so far.' })
  probe(
    @Param('probeId', new ParseUUIDPipe()) probeId: string,
    @Headers(CORRELATION_HEADER) correlationId: string,
  ): Promise<ProbeStatus> {
    return this.probes.status(probeId, correlationId);
  }
}
