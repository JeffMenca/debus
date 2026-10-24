import {
  type SystemRepairExpensesPage,
  type SystemRepairExpensesQuery,
  formatPlate,
  toPage,
} from '@debus/contracts';
import { Injectable } from '@nestjs/common';
import { BranchNames } from '../../common/branch-names';
import { PdfRenderer } from '../../common/pdf/pdf-renderer';
import { assertPdfSize } from '../../common/report-rules';
import { PrismaService } from '../../prisma/prisma.service';
import { toReportDocument } from './system-repair-expenses.pdf';
import {
  type BusPlateRecord,
  type RepairCategoryRecord,
  type RepairLineRecord,
  type RepairTotalsRecord,
  toCategoryGroups,
  toRepairRow,
  toRepairTotals,
} from './system-repair-expenses.rows';
import {
  allRepairsQuery,
  busPlateQuery,
  repairCategoriesQuery,
  repairPageQuery,
  repairTotalsQuery,
} from './system-repair-expenses.sql';

@Injectable()
export class SystemRepairExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly names: BranchNames,
    private readonly renderer: PdfRenderer,
  ) {}

  async page(query: SystemRepairExpensesQuery): Promise<SystemRepairExpensesPage> {
    const [records, totalsRecords, groups] = await this.prisma.$transaction([
      this.prisma.$queryRaw<RepairLineRecord[]>(repairPageQuery(query)),
      this.prisma.$queryRaw<RepairTotalsRecord[]>(repairTotalsQuery(query)),
      this.prisma.$queryRaw<RepairCategoryRecord[]>(repairCategoriesQuery(query)),
    ]);
    const totals = toRepairTotals(totalsRecords[0]);
    return {
      ...toPage(records.map(toRepairRow), totals.lines, query),
      summary: { totals, groups: toCategoryGroups(groups) },
    };
  }

  async pdf(query: SystemRepairExpensesQuery): Promise<Buffer> {
    const [totalsRecord] = await this.prisma.$queryRaw<RepairTotalsRecord[]>(
      repairTotalsQuery(query),
    );
    const totals = toRepairTotals(totalsRecord);
    assertPdfSize(totals.lines);
    const [records, groups, branchLabel, busLabel] = await Promise.all([
      this.prisma.$queryRaw<RepairLineRecord[]>(allRepairsQuery(query)),
      this.prisma.$queryRaw<RepairCategoryRecord[]>(repairCategoriesQuery(query)),
      query.branchId ? this.names.nameOf(query.branchId) : null,
      query.busId ? this.busLabel(query.busId) : null,
    ]);
    return this.renderer.render(
      toReportDocument({
        query,
        branchLabel,
        busLabel,
        rows: records.map(toRepairRow),
        totals,
        groups: toCategoryGroups(groups),
        now: new Date(),
      }),
    );
  }

  private async busLabel(busId: string): Promise<string | null> {
    const [record] = await this.prisma.$queryRaw<BusPlateRecord[]>(busPlateQuery(busId));
    return record ? formatPlate(record.plate) : null;
  }
}
