import {
  type SystemBusOptionsPage,
  type SystemBusOptionsQuery,
  systemBusOptionsQuerySchema,
} from '@debus/contracts';
import { Roles, ZodBody, apiErrors, apiQuery, apiSuccess } from '@debus/server';
import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SystemBusOptionsService } from './system-bus-options.service';

// The buses of every branch for the filter of the repair report: flota only answers a branch
// administrator about his own buses.
@ApiTags('reports')
@ApiBearerAuth()
@Roles('SYSTEM_ADMIN')
@Controller('reports/system-bus-options')
export class SystemBusOptionsController {
  constructor(private readonly options: SystemBusOptionsService) {}

  @Get()
  @apiSuccess(200)
  @apiErrors(400)
  @apiQuery(systemBusOptionsQuerySchema)
  page(
    @Query(new ZodBody(systemBusOptionsQuerySchema)) query: SystemBusOptionsQuery,
  ): Promise<SystemBusOptionsPage> {
    return this.options.page(query);
  }
}
