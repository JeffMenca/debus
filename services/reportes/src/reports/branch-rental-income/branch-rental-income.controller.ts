import {
  type BranchRentalIncomePage,
  type BranchRentalIncomeQuery,
  branchRentalIncomeQuerySchema,
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
import { BranchRentalIncomeService } from './branch-rental-income.service';

@ApiTags('reports')
@ApiBearerAuth()
@Roles('BRANCH_ADMIN')
@Controller('reports/branch-rental-income')
export class BranchRentalIncomeController {
  constructor(private readonly report: BranchRentalIncomeService) {}

  @Get()
  @apiSuccess(200)
  @apiErrors(400)
  @apiQuery(branchRentalIncomeQuerySchema)
  page(
    @CurrentIdentity() actor: Identity,
    @Query(new ZodBody(branchRentalIncomeQuerySchema)) query: BranchRentalIncomeQuery,
  ): Promise<BranchRentalIncomePage> {
    return this.report.page(requireBranch(actor), query);
  }

  @Get('pdf')
  @apiPdf()
  @apiErrors(400, 409)
  @apiQuery(branchRentalIncomeQuerySchema)
  async pdf(
    @CurrentIdentity() actor: Identity,
    @Query(new ZodBody(branchRentalIncomeQuerySchema)) query: BranchRentalIncomeQuery,
  ): Promise<StreamableFile> {
    return pdfFile(
      await this.report.pdf(requireBranch(actor), query),
      'reporte-ingresos-alquileres',
    );
  }
}
