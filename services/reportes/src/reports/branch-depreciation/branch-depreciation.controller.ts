import {
  type BranchDepreciationPage,
  type BranchDepreciationQuery,
  branchDepreciationQuerySchema,
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
import { BranchDepreciationService } from './branch-depreciation.service';

@ApiTags('reports')
@ApiBearerAuth()
@Roles('BRANCH_ADMIN')
@Controller('reports/branch-depreciation')
export class BranchDepreciationController {
  constructor(private readonly report: BranchDepreciationService) {}

  @Get()
  @apiSuccess(200)
  @apiErrors(400)
  @apiQuery(branchDepreciationQuerySchema)
  page(
    @CurrentIdentity() actor: Identity,
    @Query(new ZodBody(branchDepreciationQuerySchema)) query: BranchDepreciationQuery,
  ): Promise<BranchDepreciationPage> {
    return this.report.page(requireBranch(actor), query);
  }

  @Get('pdf')
  @apiPdf()
  @apiErrors(400, 409)
  @apiQuery(branchDepreciationQuerySchema)
  async pdf(
    @CurrentIdentity() actor: Identity,
    @Query(new ZodBody(branchDepreciationQuerySchema)) query: BranchDepreciationQuery,
  ): Promise<StreamableFile> {
    return pdfFile(await this.report.pdf(requireBranch(actor), query), 'reporte-depreciacion');
  }
}
