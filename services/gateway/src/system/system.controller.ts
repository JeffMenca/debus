import {
  CORRELATION_HEADER,
  type ProbeCreated,
  type ProbeStatus,
  type SystemStatus,
} from '@debus/contracts';
import { Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ProbeService } from './probe.service';
import { SystemStatusService } from './system-status.service';

@ApiTags('system')
@Controller('api/system')
export class SystemController {
  constructor(
    private readonly status: SystemStatusService,
    private readonly probes: ProbeService,
  ) {}

  @Get('status')
  check(@Headers(CORRELATION_HEADER) correlationId: string): Promise<SystemStatus> {
    return this.status.check(correlationId);
  }

  @Post('probes')
  @HttpCode(202)
  emit(@Headers(CORRELATION_HEADER) correlationId: string): Promise<ProbeCreated> {
    return this.probes.emit(correlationId);
  }

  @Get('probes/:probeId')
  probe(
    @Param('probeId', new ParseUUIDPipe()) probeId: string,
    @Headers(CORRELATION_HEADER) correlationId: string,
  ): Promise<ProbeStatus> {
    return this.probes.status(probeId, correlationId);
  }
}
