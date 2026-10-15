import {
  type BranchTicketIncomePage,
  type BranchTicketIncomeQuery,
  formatPlate,
  toPage,
} from '@debus/contracts';
import { Injectable } from '@nestjs/common';
import { BranchNames } from '../../common/branch-names';
import { PdfRenderer } from '../../common/pdf/pdf-renderer';
import { assertPdfSize } from '../../common/report-rules';
import { PrismaService } from '../../prisma/prisma.service';
import { type TicketIncomeDocumentInput, toReportDocument } from './branch-ticket-income.pdf';
import {
  type FilterLabelsRecord,
  type TicketIncomeGroupRecord,
  type TicketIncomeRecord,
  type TicketIncomeTotalsRecord,
  routeName,
  toTicketIncomeGroups,
  toTicketIncomeRow,
  toTicketIncomeTotals,
} from './branch-ticket-income.rows';
import {
  allTicketIncomeQuery,
  filterLabelsQuery,
  ticketIncomeGroupsQuery,
  ticketIncomePageQuery,
  ticketIncomeTotalsQuery,
} from './branch-ticket-income.sql';

@Injectable()
export class BranchTicketIncomeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly names: BranchNames,
    private readonly renderer: PdfRenderer,
  ) {}

  async page(branchId: string, query: BranchTicketIncomeQuery): Promise<BranchTicketIncomePage> {
    const [records, totalsRecords, groups] = await this.prisma.$transaction([
      this.prisma.$queryRaw<TicketIncomeRecord[]>(ticketIncomePageQuery(branchId, query)),
      this.prisma.$queryRaw<TicketIncomeTotalsRecord[]>(ticketIncomeTotalsQuery(branchId, query)),
      this.prisma.$queryRaw<TicketIncomeGroupRecord[]>(ticketIncomeGroupsQuery(branchId, query)),
    ]);
    const totals = toTicketIncomeTotals(totalsRecords[0]);
    return {
      ...toPage(records.map(toTicketIncomeRow), totals.trips, query),
      summary: { totals, groups: toTicketIncomeGroups(groups) },
    };
  }

  async pdf(branchId: string, query: BranchTicketIncomeQuery): Promise<Buffer> {
    const [totalsRecord] = await this.prisma.$queryRaw<TicketIncomeTotalsRecord[]>(
      ticketIncomeTotalsQuery(branchId, query),
    );
    const totals = toTicketIncomeTotals(totalsRecord);
    assertPdfSize(totals.trips);
    const [records, groups, branchName, labels] = await Promise.all([
      this.prisma.$queryRaw<TicketIncomeRecord[]>(allTicketIncomeQuery(branchId, query)),
      this.prisma.$queryRaw<TicketIncomeGroupRecord[]>(ticketIncomeGroupsQuery(branchId, query)),
      this.names.nameOf(branchId),
      this.filterLabels(branchId, query),
    ]);
    return this.renderer.render(
      toReportDocument({
        branchName,
        query,
        rows: records.map(toTicketIncomeRow),
        totals,
        groups: toTicketIncomeGroups(groups),
        ...labels,
        now: new Date(),
      }),
    );
  }

  private async filterLabels(
    branchId: string,
    query: BranchTicketIncomeQuery,
  ): Promise<Pick<TicketIncomeDocumentInput, 'routeLabel' | 'busLabel'>> {
    if (!query.routeId && !query.busId) return { routeLabel: null, busLabel: null };
    const [record] = await this.prisma.$queryRaw<FilterLabelsRecord[]>(
      filterLabelsQuery(branchId, query),
    );
    return {
      routeLabel:
        record?.origin_label && record.destination_label
          ? routeName(record.origin_label, record.destination_label)
          : null,
      busLabel: record?.bus_plate ? formatPlate(record.bus_plate) : null,
    };
  }
}
