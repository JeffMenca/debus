import { type SystemIncomePage, type SystemIncomeQuery, toPage } from '@debus/contracts';
import { Injectable } from '@nestjs/common';
import { BranchNames } from '../../common/branch-names';
import { PdfRenderer } from '../../common/pdf/pdf-renderer';
import { assertPdfSize } from '../../common/report-rules';
import { PrismaService } from '../../prisma/prisma.service';
import { type BranchGroupRecord, toBranchGroups } from '../system-finance/branch-groups.rows';
import { toReportDocument } from './system-income.pdf';
import {
  type IncomeRecord,
  type IncomeTotalsRecord,
  toIncomeRow,
  toIncomeTotals,
} from './system-income.rows';
import {
  allIncomeQuery,
  incomeGroupsQuery,
  incomePageQuery,
  incomeTotalsQuery,
} from './system-income.sql';

@Injectable()
export class SystemIncomeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly names: BranchNames,
    private readonly renderer: PdfRenderer,
  ) {}

  async page(query: SystemIncomeQuery): Promise<SystemIncomePage> {
    const [records, totalsRecords, groups] = await this.prisma.$transaction([
      this.prisma.$queryRaw<IncomeRecord[]>(incomePageQuery(query)),
      this.prisma.$queryRaw<IncomeTotalsRecord[]>(incomeTotalsQuery(query)),
      this.prisma.$queryRaw<BranchGroupRecord[]>(incomeGroupsQuery(query)),
    ]);
    const totals = toIncomeTotals(totalsRecords[0]);
    return {
      ...toPage(records.map(toIncomeRow), totals.entries, query),
      summary: { totals, groups: toBranchGroups(groups) },
    };
  }

  async pdf(query: SystemIncomeQuery): Promise<Buffer> {
    const [totalsRecord] = await this.prisma.$queryRaw<IncomeTotalsRecord[]>(
      incomeTotalsQuery(query),
    );
    const totals = toIncomeTotals(totalsRecord);
    assertPdfSize(totals.entries);
    const [records, groups, branchLabel] = await Promise.all([
      this.prisma.$queryRaw<IncomeRecord[]>(allIncomeQuery(query)),
      this.prisma.$queryRaw<BranchGroupRecord[]>(incomeGroupsQuery(query)),
      query.branchId ? this.names.nameOf(query.branchId) : null,
    ]);
    return this.renderer.render(
      toReportDocument({
        query,
        branchLabel,
        rows: records.map(toIncomeRow),
        totals,
        groups: toBranchGroups(groups),
        now: new Date(),
      }),
    );
  }
}
