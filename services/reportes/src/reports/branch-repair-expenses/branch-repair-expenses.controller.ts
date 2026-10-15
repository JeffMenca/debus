import {
  type BranchRepairExpensesPage,
  type BranchRepairExpensesQuery,
  branchRepairExpensesQuerySchema,
} from '@debus/contracts';
import {
  CurrentIdentity,
  type Identity,
  Roles,
  ZodBody,
  apiErrors,
  apiQuery,
  apiSuccess,
  requireBranch,
} from '@debus/server';
import { Controller, Get, Query, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { apiPdf } from '../../common/api-pdf';
import { pdfFile } from '../../common/pdf/pdf-file';
import { BranchRepairExpensesService } from './branch-repair-expenses.service';

@ApiTags('reports')
@ApiBearerAuth()
@Roles('BRANCH_ADMIN')
@Controller('reports/branch-repair-expenses')
export class BranchRepairExpensesController {
  constructor(private readonly report: BranchRepairExpensesService) {}

  @Get()
  @apiSuccess(200)
  @apiErrors(400)
  @apiQuery(branchRepairExpensesQuerySchema)
  page(
    @CurrentIdentity() actor: Identity,
    @Query(new ZodBody(branchRepairExpensesQuerySchema)) query: BranchRepairExpensesQuery,
  ): Promise<BranchRepairExpensesPage> {
    return this.report.page(requireBranch(actor), query);
  }

  @Get('pdf')
  @apiPdf()
  @apiErrors(400, 409)
  @apiQuery(branchRepairExpensesQuerySchema)
  async pdf(
    @CurrentIdentity() actor: Identity,
    @Query(new ZodBody(branchRepairExpensesQuerySchema)) query: BranchRepairExpensesQuery,
  ): Promise<StreamableFile> {
    return pdfFile(await this.report.pdf(requireBranch(actor), query), 'reporte-taller');
  }
}
