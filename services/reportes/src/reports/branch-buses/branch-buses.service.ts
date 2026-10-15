import { type BranchBusesPage, type BranchBusesQuery, toPage } from '@debus/contracts';
import { Injectable } from '@nestjs/common';
import { BranchNames } from '../../common/branch-names';
import { PdfRenderer } from '../../common/pdf/pdf-renderer';
import { assertPdfSize } from '../../common/report-rules';
import { PrismaService } from '../../prisma/prisma.service';
import { toReportDocument } from './branch-buses.pdf';
import {
  type BusRecord,
  type BusTotalsRecord,
  type StatusCountRecord,
  toBusRow,
  toBusTotals,
  toStatusGroups,
} from './branch-buses.rows';
import { allBusesQuery, busPageQuery, busTotalsQuery, statusCountsQuery } from './branch-buses.sql';

@Injectable()
export class BranchBusesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly names: BranchNames,
    private readonly renderer: PdfRenderer,
  ) {}

  async page(branchId: string, query: BranchBusesQuery): Promise<BranchBusesPage> {
    const [records, totalsRecords, counts] = await this.prisma.$transaction([
      this.prisma.$queryRaw<BusRecord[]>(busPageQuery(branchId, query)),
      this.prisma.$queryRaw<BusTotalsRecord[]>(busTotalsQuery(branchId, query)),
      this.prisma.$queryRaw<StatusCountRecord[]>(statusCountsQuery(branchId, query.q)),
    ]);
    const totals = toBusTotals(totalsRecords[0]);
    return {
      ...toPage(records.map(toBusRow), totals.buses, query),
      summary: { totals, groups: toStatusGroups(counts) },
    };
  }

  async pdf(branchId: string, query: BranchBusesQuery): Promise<Buffer> {
    const [totalsRecord] = await this.prisma.$queryRaw<BusTotalsRecord[]>(
      busTotalsQuery(branchId, query),
    );
    const totals = toBusTotals(totalsRecord);
    assertPdfSize(totals.buses);
    const [records, branchName] = await Promise.all([
      this.prisma.$queryRaw<BusRecord[]>(allBusesQuery(branchId, query)),
      this.names.nameOf(branchId),
    ]);
    return this.renderer.render(
      toReportDocument({ branchName, query, rows: records.map(toBusRow), totals, now: new Date() }),
    );
  }
}
