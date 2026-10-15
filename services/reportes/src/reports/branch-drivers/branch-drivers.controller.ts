import {
  type BranchDriversPage,
  type BranchDriversQuery,
  branchDriversQuerySchema,
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
import { BranchDriversService } from './branch-drivers.service';

@ApiTags('reports')
@ApiBearerAuth()
@Roles('BRANCH_ADMIN')
@Controller('reports/branch-drivers')
export class BranchDriversController {
  constructor(private readonly report: BranchDriversService) {}

  @Get()
  @apiSuccess(200)
  @apiErrors(400)
  @apiQuery(branchDriversQuerySchema)
  page(
    @CurrentIdentity() actor: Identity,
    @Query(new ZodBody(branchDriversQuerySchema)) query: BranchDriversQuery,
  ): Promise<BranchDriversPage> {
    return this.report.page(requireBranch(actor), query);
  }

  @Get('pdf')
  @apiPdf()
  @apiErrors(400, 409)
  @apiQuery(branchDriversQuerySchema)
  async pdf(
    @CurrentIdentity() actor: Identity,
    @Query(new ZodBody(branchDriversQuerySchema)) query: BranchDriversQuery,
  ): Promise<StreamableFile> {
    return pdfFile(await this.report.pdf(requireBranch(actor), query), 'reporte-choferes');
  }
}
