import { type SystemTopRoutesPage, type SystemTopRoutesQuery, toPage } from '@debus/contracts';
import { Injectable } from '@nestjs/common';
import { BranchNames } from '../../common/branch-names';
import { PdfRenderer } from '../../common/pdf/pdf-renderer';
import { assertPdfSize } from '../../common/report-rules';
import { PrismaService } from '../../prisma/prisma.service';
import { toReportDocument } from './system-top-routes.pdf';
import {
  type TopRouteRecord,
  type TopRoutesTotalsRecord,
  toTopRouteRow,
  toTopRoutesTotals,
} from './system-top-routes.rows';
import {
  allTopRoutesQuery,
  topRoutesPageQuery,
  topRoutesTotalsQuery,
} from './system-top-routes.sql';

@Injectable()
export class SystemTopRoutesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly names: BranchNames,
    private readonly renderer: PdfRenderer,
  ) {}

  async page(query: SystemTopRoutesQuery): Promise<SystemTopRoutesPage> {
    const [records, totalsRecords] = await this.prisma.$transaction([
      this.prisma.$queryRaw<TopRouteRecord[]>(topRoutesPageQuery(query)),
      this.prisma.$queryRaw<TopRoutesTotalsRecord[]>(topRoutesTotalsQuery(query)),
    ]);
    const totals = toTopRoutesTotals(totalsRecords[0]);
    return {
      ...toPage(
        records.map((record) => toTopRouteRow(record, totals.tickets)),
        totals.routes,
        query,
      ),
      summary: { totals, groups: [] },
    };
  }

  async pdf(query: SystemTopRoutesQuery): Promise<Buffer> {
    const [totalsRecord] = await this.prisma.$queryRaw<TopRoutesTotalsRecord[]>(
      topRoutesTotalsQuery(query),
    );
    const totals = toTopRoutesTotals(totalsRecord);
    assertPdfSize(totals.routes);
    const [records, branchLabel] = await Promise.all([
      this.prisma.$queryRaw<TopRouteRecord[]>(allTopRoutesQuery(query)),
      query.branchId ? this.names.nameOf(query.branchId) : null,
    ]);
    return this.renderer.render(
      toReportDocument({
        query,
        branchLabel,
        rows: records.map((record) => toTopRouteRow(record, totals.tickets)),
        totals,
        now: new Date(),
      }),
    );
  }
}
