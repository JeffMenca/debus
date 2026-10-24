import {
  type SystemTopRoutesPage,
  type SystemTopRoutesQuery,
  systemTopRoutesQuerySchema,
} from '@debus/contracts';
import { Roles, ZodBody, apiErrors, apiQuery, apiSuccess } from '@debus/server';
import { Controller, Get, Query, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { apiPdf } from '../../common/api-pdf';
import { pdfFile } from '../../common/pdf/pdf-file';
import { SystemTopRoutesService } from './system-top-routes.service';

@ApiTags('reports')
@ApiBearerAuth()
@Roles('SYSTEM_ADMIN')
@Controller('reports/system-top-routes')
export class SystemTopRoutesController {
  constructor(private readonly report: SystemTopRoutesService) {}

  @Get()
  @apiSuccess(200)
  @apiErrors(400)
  @apiQuery(systemTopRoutesQuerySchema)
  page(
    @Query(new ZodBody(systemTopRoutesQuerySchema)) query: SystemTopRoutesQuery,
  ): Promise<SystemTopRoutesPage> {
    return this.report.page(query);
  }

  @Get('pdf')
  @apiPdf()
  @apiErrors(400, 409)
  @apiQuery(systemTopRoutesQuerySchema)
  async pdf(
    @Query(new ZodBody(systemTopRoutesQuerySchema)) query: SystemTopRoutesQuery,
  ): Promise<StreamableFile> {
    return pdfFile(await this.report.pdf(query), 'reporte-rutas-demandadas');
  }
}
