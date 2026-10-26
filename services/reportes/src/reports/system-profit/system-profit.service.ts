import { type SystemProfitPage, type SystemProfitQuery, toPage } from '@debus/contracts';
import { Injectable } from '@nestjs/common';
import { BranchNames } from '../../common/branch-names';
import { PdfRenderer } from '../../common/pdf/pdf-renderer';
import { assertPdfSize } from '../../common/report-rules';
import { PrismaService } from '../../prisma/prisma.service';
import { toReportDocument } from './system-profit.pdf';
import {
  type ProfitRecord,
  type ProfitTotalsRecord,
  toProfitRow,
  toProfitTotals,
} from './system-profit.rows';
import { allProfitQuery, profitPageQuery, profitTotalsQuery } from './system-profit.sql';

@Injectable()
export class SystemProfitService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly names: BranchNames,
    private readonly renderer: PdfRenderer,
  ) {}

  async page(query: SystemProfitQuery): Promise<SystemProfitPage> {
    const [records, totalsRecords] = await this.prisma.$transaction([
      this.prisma.$queryRaw<ProfitRecord[]>(profitPageQuery(query)),
      this.prisma.$queryRaw<ProfitTotalsRecord[]>(profitTotalsQuery(query)),
    ]);
    return {
      ...toPage(records.map(toProfitRow), totalsRecords[0]?.branches ?? 0, query),
      summary: { totals: toProfitTotals(totalsRecords[0]), groups: [] },
    };
  }

  async pdf(query: SystemProfitQuery): Promise<Buffer> {
    const [totalsRecord] = await this.prisma.$queryRaw<ProfitTotalsRecord[]>(
      profitTotalsQuery(query),
    );
    assertPdfSize(totalsRecord?.branches ?? 0);
    const [records, branchLabel] = await Promise.all([
      this.prisma.$queryRaw<ProfitRecord[]>(allProfitQuery(query)),
      query.branchId ? this.names.nameOf(query.branchId) : null,
    ]);
    return this.renderer.render(
      toReportDocument({
        query,
        branchLabel,
        rows: records.map(toProfitRow),
        totals: toProfitTotals(totalsRecord),
        now: new Date(),
      }),
    );
  }
}
