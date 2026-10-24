import {
  type SystemRoutesMap,
  type SystemRoutesMapQuery,
  systemRoutesMapQuerySchema,
} from '@debus/contracts';
import { Roles, ZodBody, apiErrors, apiQuery, apiSuccess } from '@debus/server';
import { Controller, Get, Query, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { apiPdf } from '../../common/api-pdf';
import { pdfFile } from '../../common/pdf/pdf-file';
import { SystemRoutesMapService } from './system-routes-map.service';

@ApiTags('reports')
@ApiBearerAuth()
@Roles('SYSTEM_ADMIN')
@Controller('reports/system-routes-map')
export class SystemRoutesMapController {
  constructor(private readonly report: SystemRoutesMapService) {}

  @Get()
  @apiSuccess(200)
  @apiErrors(400)
  @apiQuery(systemRoutesMapQuerySchema)
  map(
    @Query(new ZodBody(systemRoutesMapQuerySchema)) query: SystemRoutesMapQuery,
  ): Promise<SystemRoutesMap> {
    return this.report.map(query);
  }

  @Get('pdf')
  @apiPdf()
  @apiErrors(400)
  @apiQuery(systemRoutesMapQuerySchema)
  async pdf(
    @Query(new ZodBody(systemRoutesMapQuerySchema)) query: SystemRoutesMapQuery,
  ): Promise<StreamableFile> {
    return pdfFile(await this.report.pdf(query), 'reporte-mapa-rutas');
  }
}
