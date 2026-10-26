import {
  type SystemIncomePage,
  type SystemIncomeQuery,
  systemIncomeQuerySchema,
} from '@debus/contracts';
import { Roles, ZodBody, apiErrors, apiQuery, apiSuccess } from '@debus/server';
import { Controller, Get, Query, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { apiPdf } from '../../common/api-pdf';
import { pdfFile } from '../../common/pdf/pdf-file';
import { SystemIncomeService } from './system-income.service';

@ApiTags('reports')
@ApiBearerAuth()
@Roles('SYSTEM_ADMIN')
@Controller('reports/system-income')
export class SystemIncomeController {
  constructor(private readonly report: SystemIncomeService) {}

  @Get()
  @apiSuccess(200)
  @apiErrors(400)
  @apiQuery(systemIncomeQuerySchema)
  page(
    @Query(new ZodBody(systemIncomeQuerySchema)) query: SystemIncomeQuery,
  ): Promise<SystemIncomePage> {
    return this.report.page(query);
  }

  @Get('pdf')
  @apiPdf()
  @apiErrors(400, 409)
  @apiQuery(systemIncomeQuerySchema)
  async pdf(
    @Query(new ZodBody(systemIncomeQuerySchema)) query: SystemIncomeQuery,
  ): Promise<StreamableFile> {
    return pdfFile(await this.report.pdf(query), 'reporte-ingresos');
  }
}
