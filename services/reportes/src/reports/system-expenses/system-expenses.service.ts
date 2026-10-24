import { type SystemExpensesPage, type SystemExpensesQuery, toPage } from '@debus/contracts';
import { Injectable } from '@nestjs/common';
import { BranchNames } from '../../common/branch-names';
import { PdfRenderer } from '../../common/pdf/pdf-renderer';
import { assertPdfSize } from '../../common/report-rules';
import { PrismaService } from '../../prisma/prisma.service';
import { type BranchGroupRecord, toBranchGroups } from '../system-finance/branch-groups.rows';
import { toReportDocument } from './system-expenses.pdf';
import {
  type ExpenseRecord,
  type ExpenseTotalsRecord,
  toExpenseRow,
  toExpenseTotals,
} from './system-expenses.rows';
import {
  allExpensesQuery,
  expensesGroupsQuery,
  expensesPageQuery,
  expensesTotalsQuery,
} from './system-expenses.sql';

@Injectable()
export class SystemExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly names: BranchNames,
    private readonly renderer: PdfRenderer,
  ) {}

  async page(query: SystemExpensesQuery): Promise<SystemExpensesPage> {
    const [records, totalsRecords, groups] = await this.prisma.$transaction([
      this.prisma.$queryRaw<ExpenseRecord[]>(expensesPageQuery(query)),
      this.prisma.$queryRaw<ExpenseTotalsRecord[]>(expensesTotalsQuery(query)),
      this.prisma.$queryRaw<BranchGroupRecord[]>(expensesGroupsQuery(query)),
    ]);
    const totals = toExpenseTotals(totalsRecords[0]);
    return {
      ...toPage(records.map(toExpenseRow), totals.entries, query),
      summary: { totals, groups: toBranchGroups(groups) },
    };
  }

  async pdf(query: SystemExpensesQuery): Promise<Buffer> {
    const [totalsRecord] = await this.prisma.$queryRaw<ExpenseTotalsRecord[]>(
      expensesTotalsQuery(query),
    );
    const totals = toExpenseTotals(totalsRecord);
    assertPdfSize(totals.entries);
    const [records, groups, branchLabel] = await Promise.all([
      this.prisma.$queryRaw<ExpenseRecord[]>(allExpensesQuery(query)),
      this.prisma.$queryRaw<BranchGroupRecord[]>(expensesGroupsQuery(query)),
      query.branchId ? this.names.nameOf(query.branchId) : null,
    ]);
    return this.renderer.render(
      toReportDocument({
        query,
        branchLabel,
        rows: records.map(toExpenseRow),
        totals,
        groups: toBranchGroups(groups),
        now: new Date(),
      }),
    );
  }
}
