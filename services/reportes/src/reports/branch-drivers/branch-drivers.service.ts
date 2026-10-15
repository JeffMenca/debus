import { type BranchDriversPage, type BranchDriversQuery, toPage } from '@debus/contracts';
import { Injectable } from '@nestjs/common';
import { BranchNames } from '../../common/branch-names';
import { PdfRenderer } from '../../common/pdf/pdf-renderer';
import { assertPdfSize } from '../../common/report-rules';
import { PrismaService } from '../../prisma/prisma.service';
import { toReportDocument } from './branch-drivers.pdf';
import {
  type ActiveCountRecord,
  type DriverRecord,
  type DriverTotalsRecord,
  toDriverGroups,
  toDriverRow,
  toDriverTotals,
} from './branch-drivers.rows';
import {
  activeCountsQuery,
  allDriversQuery,
  driverPageQuery,
  driverTotalsQuery,
} from './branch-drivers.sql';

@Injectable()
export class BranchDriversService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly names: BranchNames,
    private readonly renderer: PdfRenderer,
  ) {}

  async page(branchId: string, query: BranchDriversQuery): Promise<BranchDriversPage> {
    const [records, totalsRecords, counts] = await this.prisma.$transaction([
      this.prisma.$queryRaw<DriverRecord[]>(driverPageQuery(branchId, query)),
      this.prisma.$queryRaw<DriverTotalsRecord[]>(driverTotalsQuery(branchId, query)),
      this.prisma.$queryRaw<ActiveCountRecord[]>(activeCountsQuery(branchId, query.q)),
    ]);
    const totals = toDriverTotals(totalsRecords[0]);
    return {
      ...toPage(records.map(toDriverRow), totals.drivers, query),
      summary: { totals, groups: toDriverGroups(counts) },
    };
  }

  async pdf(branchId: string, query: BranchDriversQuery): Promise<Buffer> {
    const [totalsRecord] = await this.prisma.$queryRaw<DriverTotalsRecord[]>(
      driverTotalsQuery(branchId, query),
    );
    const totals = toDriverTotals(totalsRecord);
    assertPdfSize(totals.drivers);
    const [records, branchName] = await Promise.all([
      this.prisma.$queryRaw<DriverRecord[]>(allDriversQuery(branchId, query)),
      this.names.nameOf(branchId),
    ]);
    return this.renderer.render(
      toReportDocument({
        branchName,
        query,
        rows: records.map(toDriverRow),
        totals,
        now: new Date(),
      }),
    );
  }
}
