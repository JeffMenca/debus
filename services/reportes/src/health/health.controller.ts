import { ServiceHttpClient } from '@debus/server';
import { Controller, Get, Optional } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

export interface HealthStatus {
  status: 'ok';
  service: string;
  circuits: ReturnType<ServiceHttpClient['circuits']>;
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  // Only a service that calls other services provides the client; the others report no circuits.
  constructor(@Optional() private readonly http?: ServiceHttpClient) {}

  @Get()
  @ApiOkResponse({
    description: 'Service is up, with the state of its connections to other services',
  })
  check(): HealthStatus {
    return { status: 'ok', service: 'reportes', circuits: this.http?.circuits() ?? [] };
  }
}
