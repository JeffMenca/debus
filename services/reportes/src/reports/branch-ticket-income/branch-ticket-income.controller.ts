import {
  type BranchTicketIncomePage,
  type BranchTicketIncomeQuery,
  branchTicketIncomeQuerySchema,
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
import { BranchTicketIncomeService } from './branch-ticket-income.service';

@ApiTags('reports')
@ApiBearerAuth()
@Roles('BRANCH_ADMIN')
@Controller('reports/branch-ticket-income')
export class BranchTicketIncomeController {
  constructor(private readonly report: BranchTicketIncomeService) {}

  @Get()
  @apiSuccess(200)
  @apiErrors(400)
  @apiQuery(branchTicketIncomeQuerySchema)
  page(
    @CurrentIdentity() actor: Identity,
    @Query(new ZodBody(branchTicketIncomeQuerySchema)) query: BranchTicketIncomeQuery,
  ): Promise<BranchTicketIncomePage> {
    return this.report.page(requireBranch(actor), query);
  }

  @Get('pdf')
  @apiPdf()
  @apiErrors(400, 409)
  @apiQuery(branchTicketIncomeQuerySchema)
  async pdf(
    @CurrentIdentity() actor: Identity,
    @Query(new ZodBody(branchTicketIncomeQuerySchema)) query: BranchTicketIncomeQuery,
  ): Promise<StreamableFile> {
    return pdfFile(await this.report.pdf(requireBranch(actor), query), 'reporte-ingresos-boletos');
  }
}
