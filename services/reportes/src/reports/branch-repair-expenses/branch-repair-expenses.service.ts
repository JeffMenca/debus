import {
  type BranchRepairExpensesPage,
  type BranchRepairExpensesQuery,
  formatPlate,
  toPage,
} from '@debus/contracts';
import { Injectable } from '@nestjs/common';
import { BranchNames } from '../../common/branch-names';
import { PdfRenderer } from '../../common/pdf/pdf-renderer';
import { assertPdfSize } from '../../common/report-rules';
import { PrismaService } from '../../prisma/prisma.service';
import { type RepairDocumentInput, toReportDocument } from './branch-repair-expenses.pdf';
import {
  type FilterLabelsRecord,
  type RepairBusRecord,
  type RepairCategoryRecord,
  type RepairGroupRecord,
  type RepairTotalsRecord,
  nestCategories,
  toRepairGroups,
  toRepairTotals,
} from './branch-repair-expenses.rows';
import {
  allRepairsQuery,
  filterLabelsQuery,
  repairCategoriesQuery,
  repairGroupsQuery,
  repairPageQuery,
  repairTotalsQuery,
} from './branch-repair-expenses.sql';

@Injectable()
export class BranchRepairExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly names: BranchNames,
    private readonly renderer: PdfRenderer,
  ) {}

  async page(
    branchId: string,
    query: BranchRepairExpensesQuery,
  ): Promise<BranchRepairExpensesPage> {
    const [buses, totalsRecords, groups] = await this.prisma.$transaction([
      this.prisma.$queryRaw<RepairBusRecord[]>(repairPageQuery(branchId, query)),
      this.prisma.$queryRaw<RepairTotalsRecord[]>(repairTotalsQuery(branchId, query)),
      this.prisma.$queryRaw<RepairGroupRecord[]>(repairGroupsQuery(branchId, query)),
    ]);
    const categories =
      buses.length === 0
        ? []
        : await this.prisma.$queryRaw<RepairCategoryRecord[]>(
            repairCategoriesQuery(
              branchId,
              query,
              buses.map((bus) => bus.id),
            ),
          );
    const totals = toRepairTotals(totalsRecords[0]);
    return {
      ...toPage(nestCategories(buses, categories), totals.buses, query),
      summary: { totals, groups: toRepairGroups(groups) },
    };
  }

  async pdf(branchId: string, query: BranchRepairExpensesQuery): Promise<Buffer> {
    const [totalsRecord] = await this.prisma.$queryRaw<RepairTotalsRecord[]>(
      repairTotalsQuery(branchId, query),
    );
    const totals = toRepairTotals(totalsRecord);
    assertPdfSize(totals.buses);
    const [buses, categories, groups, branchName, labels] = await Promise.all([
      this.prisma.$queryRaw<RepairBusRecord[]>(allRepairsQuery(branchId, query)),
      this.prisma.$queryRaw<RepairCategoryRecord[]>(repairCategoriesQuery(branchId, query)),
      this.prisma.$queryRaw<RepairGroupRecord[]>(repairGroupsQuery(branchId, query)),
      this.names.nameOf(branchId),
      this.filterLabels(branchId, query),
    ]);
    return this.renderer.render(
      toReportDocument({
        branchName,
        query,
        rows: nestCategories(buses, categories),
        totals,
        groups: toRepairGroups(groups),
        ...labels,
        now: new Date(),
      }),
    );
  }

  private async filterLabels(
    branchId: string,
    query: BranchRepairExpensesQuery,
  ): Promise<Pick<RepairDocumentInput, 'busLabel' | 'categoryName'>> {
    if (!query.busId && !query.categoryId) return { busLabel: null, categoryName: null };
    const [record] = await this.prisma.$queryRaw<FilterLabelsRecord[]>(
      filterLabelsQuery(branchId, query),
    );
    return {
      busLabel: record?.bus_plate ? formatPlate(record.bus_plate) : null,
      categoryName: record?.category_name ?? null,
    };
  }
}
