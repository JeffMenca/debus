import {
  type SystemRepairExpensesPage,
  type SystemRepairExpensesQuery,
  systemRepairExpensesQuerySchema,
} from '@debus/contracts';
import { Roles, ZodBody, apiErrors, apiQuery, apiSuccess } from '@debus/server';
import { Controller, Get, Query, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { apiPdf } from '../../common/api-pdf';
import { pdfFile } from '../../common/pdf/pdf-file';
import { SystemRepairExpensesService } from './system-repair-expenses.service';

@ApiTags('reports')
@ApiBearerAuth()
@Roles('SYSTEM_ADMIN')
@Controller('reports/system-repair-expenses')
export class SystemRepairExpensesController {
  constructor(private readonly report: SystemRepairExpensesService) {}

  @Get()
  @apiSuccess(200)
  @apiErrors(400)
  @apiQuery(systemRepairExpensesQuerySchema)
  page(
    @Query(new ZodBody(systemRepairExpensesQuerySchema)) query: SystemRepairExpensesQuery,
  ): Promise<SystemRepairExpensesPage> {
    return this.report.page(query);
  }

  @Get('pdf')
  @apiPdf()
  @apiErrors(400, 409)
  @apiQuery(systemRepairExpensesQuerySchema)
  async pdf(
    @Query(new ZodBody(systemRepairExpensesQuerySchema)) query: SystemRepairExpensesQuery,
  ): Promise<StreamableFile> {
    return pdfFile(await this.report.pdf(query), 'reporte-taller');
  }
}
