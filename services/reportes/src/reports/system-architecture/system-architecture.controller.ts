import {
  type ArchitecturePage,
  type ArchitectureQuery,
  architectureQuerySchema,
} from '@debus/contracts';
import { Roles, ZodBody, apiErrors, apiQuery, apiSuccess } from '@debus/server';
import { Controller, Get, Query, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { apiPdf } from '../../common/api-pdf';
import { pdfFile } from '../../common/pdf/pdf-file';
import { SystemArchitectureService } from './system-architecture.service';

@ApiTags('reports')
@ApiBearerAuth()
@Roles('SYSTEM_ADMIN')
@Controller('reports/system-architecture')
export class SystemArchitectureController {
  constructor(private readonly report: SystemArchitectureService) {}

  @Get()
  @apiSuccess(200)
  @apiErrors(400)
  @apiQuery(architectureQuerySchema)
  page(@Query(new ZodBody(architectureQuerySchema)) query: ArchitectureQuery): ArchitecturePage {
    return this.report.page(query);
  }

  @Get('pdf')
  @apiPdf()
  @apiErrors(400)
  @apiQuery(architectureQuerySchema)
  async pdf(
    @Query(new ZodBody(architectureQuerySchema)) query: ArchitectureQuery,
  ): Promise<StreamableFile> {
    return pdfFile(await this.report.pdf(query), 'reporte-arquitectura');
  }
}
