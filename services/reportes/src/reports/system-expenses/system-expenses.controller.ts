import {
  type SystemExpensesPage,
  type SystemExpensesQuery,
  systemExpensesQuerySchema,
} from '@debus/contracts';
import { Roles, ZodBody, apiErrors, apiQuery, apiSuccess } from '@debus/server';
import { Controller, Get, Query, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { apiPdf } from '../../common/api-pdf';
import { pdfFile } from '../../common/pdf/pdf-file';
import { SystemExpensesService } from './system-expenses.service';

@ApiTags('reports')
@ApiBearerAuth()
@Roles('SYSTEM_ADMIN')
@Controller('reports/system-expenses')
export class SystemExpensesController {
  constructor(private readonly report: SystemExpensesService) {}

  @Get()
  @apiSuccess(200)
  @apiErrors(400)
  @apiQuery(systemExpensesQuerySchema)
  page(
    @Query(new ZodBody(systemExpensesQuerySchema)) query: SystemExpensesQuery,
  ): Promise<SystemExpensesPage> {
    return this.report.page(query);
  }

  @Get('pdf')
  @apiPdf()
  @apiErrors(400, 409)
  @apiQuery(systemExpensesQuerySchema)
  async pdf(
    @Query(new ZodBody(systemExpensesQuerySchema)) query: SystemExpensesQuery,
  ): Promise<StreamableFile> {
    return pdfFile(await this.report.pdf(query), 'reporte-gastos');
  }
}
