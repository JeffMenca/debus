import {
  type BranchDepreciationPage,
  type BranchDepreciationQuery,
  toPage,
  todayInGuatemala,
} from '@debus/contracts';
import { Injectable } from '@nestjs/common';
import { BranchNames } from '../../common/branch-names';
import { PdfRenderer } from '../../common/pdf/pdf-renderer';
import { assertPdfSize } from '../../common/report-rules';
import { PrismaService } from '../../prisma/prisma.service';
import { toReportDocument } from './branch-depreciation.pdf';
import {
  type CurrentRateRecord,
  type DepreciationRecord,
  type DepreciationTotalsRecord,
  toCurrentPerKm,
  toDepreciationRow,
  toDepreciationTotals,
} from './branch-depreciation.rows';
import {
  allDepreciationQuery,
  currentRateQuery,
  depreciationPageQuery,
  depreciationTotalsQuery,
} from './branch-depreciation.sql';

@Injectable()
export class BranchDepreciationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly names: BranchNames,
    private readonly renderer: PdfRenderer,
  ) {}

  async page(branchId: string, query: BranchDepreciationQuery): Promise<BranchDepreciationPage> {
    const [records, totalsRecords, rates] = await this.prisma.$transaction([
      this.prisma.$queryRaw<DepreciationRecord[]>(depreciationPageQuery(branchId, query)),
      this.prisma.$queryRaw<DepreciationTotalsRecord[]>(depreciationTotalsQuery(branchId, query)),
      this.prisma.$queryRaw<CurrentRateRecord[]>(currentRateQuery(todayInGuatemala())),
    ]);
    return {
      ...toPage(records.map(toDepreciationRow), totalsRecords[0]?.buses ?? 0, query),
      summary: {
        totals: toDepreciationTotals(totalsRecords[0], toCurrentPerKm(rates)),
        groups: [],
      },
    };
  }

  async pdf(branchId: string, query: BranchDepreciationQuery): Promise<Buffer> {
    const [totalsRecord] = await this.prisma.$queryRaw<DepreciationTotalsRecord[]>(
      depreciationTotalsQuery(branchId, query),
    );
    assertPdfSize(totalsRecord?.buses ?? 0);
    const [records, rates, branchName] = await Promise.all([
      this.prisma.$queryRaw<DepreciationRecord[]>(allDepreciationQuery(branchId, query)),
      this.prisma.$queryRaw<CurrentRateRecord[]>(currentRateQuery(todayInGuatemala())),
      this.names.nameOf(branchId),
    ]);
    return this.renderer.render(
      toReportDocument({
        branchName,
        query,
        rows: records.map(toDepreciationRow),
        totals: toDepreciationTotals(totalsRecord, toCurrentPerKm(rates)),
        now: new Date(),
      }),
    );
  }
}
