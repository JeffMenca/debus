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

@ApiTags('sistema')
@Controller('api/sistema')
export class SystemController {
  constructor(
    private readonly status: SystemStatusService,
    private readonly probes: ProbeService,
  ) {}

  @Get('estado')
  check(@Headers(CORRELATION_HEADER) correlationId: string): Promise<SystemStatus> {
    return this.status.check(correlationId);
  }

  @Post('sondeos')
  @HttpCode(202)
  emit(@Headers(CORRELATION_HEADER) correlationId: string): Promise<ProbeCreated> {
    return this.probes.emit(correlationId);
  }

  @Get('sondeos/:probeId')
  probe(
    @Param('probeId', new ParseUUIDPipe()) probeId: string,
    @Headers(CORRELATION_HEADER) correlationId: string,
  ): Promise<ProbeStatus> {
    return this.probes.status(probeId, correlationId);
  }
}
