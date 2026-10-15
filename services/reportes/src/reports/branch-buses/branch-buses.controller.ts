import {
  type BranchBusesPage,
  type BranchBusesQuery,
  branchBusesQuerySchema,
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
import { BranchBusesService } from './branch-buses.service';

@ApiTags('reports')
@ApiBearerAuth()
@Roles('BRANCH_ADMIN')
@Controller('reports/branch-buses')
export class BranchBusesController {
  constructor(private readonly report: BranchBusesService) {}

  @Get()
  @apiSuccess(200)
  @apiErrors(400)
  @apiQuery(branchBusesQuerySchema)
  page(
    @CurrentIdentity() actor: Identity,
    @Query(new ZodBody(branchBusesQuerySchema)) query: BranchBusesQuery,
  ): Promise<BranchBusesPage> {
    return this.report.page(requireBranch(actor), query);
  }

  @Get('pdf')
  @apiPdf()
  @apiErrors(400, 409)
  @apiQuery(branchBusesQuerySchema)
  async pdf(
    @CurrentIdentity() actor: Identity,
    @Query(new ZodBody(branchBusesQuerySchema)) query: BranchBusesQuery,
  ): Promise<StreamableFile> {
    return pdfFile(await this.report.pdf(requireBranch(actor), query), 'reporte-buses');
  }
}
