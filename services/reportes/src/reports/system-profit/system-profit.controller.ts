import {
  type SystemProfitPage,
  type SystemProfitQuery,
  systemProfitQuerySchema,
} from '@debus/contracts';
import { Roles, ZodBody, apiErrors, apiQuery, apiSuccess } from '@debus/server';
import { Controller, Get, Query, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { apiPdf } from '../../common/api-pdf';
import { pdfFile } from '../../common/pdf/pdf-file';
import { SystemProfitService } from './system-profit.service';

@ApiTags('reports')
@ApiBearerAuth()
@Roles('SYSTEM_ADMIN')
@Controller('reports/system-profit')
export class SystemProfitController {
  constructor(private readonly report: SystemProfitService) {}

  @Get()
  @apiSuccess(200)
  @apiErrors(400)
  @apiQuery(systemProfitQuerySchema)
  page(
    @Query(new ZodBody(systemProfitQuerySchema)) query: SystemProfitQuery,
  ): Promise<SystemProfitPage> {
    return this.report.page(query);
  }

  @Get('pdf')
  @apiPdf()
  @apiErrors(400, 409)
  @apiQuery(systemProfitQuerySchema)
  async pdf(
    @Query(new ZodBody(systemProfitQuerySchema)) query: SystemProfitQuery,
  ): Promise<StreamableFile> {
    return pdfFile(await this.report.pdf(query), 'reporte-ganancias');
  }
}
