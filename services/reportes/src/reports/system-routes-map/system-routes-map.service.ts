import type { SystemRoutesMap, SystemRoutesMapQuery } from '@debus/contracts';
import { Injectable } from '@nestjs/common';
import { PdfRenderer } from '../../common/pdf/pdf-renderer';
import { PrismaService } from '../../prisma/prisma.service';
import { toReportDocument } from './system-routes-map.pdf';
import {
  type MapBranchRecord,
  type MapRouteRecord,
  selectedBranchOf,
  toMapBranch,
  toMapRoute,
} from './system-routes-map.rows';
import { mapBranchesQuery, mapRoutesQuery } from './system-routes-map.sql';

@Injectable()
export class SystemRoutesMapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly renderer: PdfRenderer,
  ) {}

  async map({ branchId }: SystemRoutesMapQuery): Promise<SystemRoutesMap> {
    const branches = (await this.prisma.$queryRaw<MapBranchRecord[]>(mapBranchesQuery)).map(
      toMapBranch,
    );
    const selectedBranchId = selectedBranchOf(branches, branchId);
    const routes = selectedBranchId
      ? await this.prisma.$queryRaw<MapRouteRecord[]>(mapRoutesQuery(selectedBranchId))
      : [];
    return { branches, selectedBranchId, routes: routes.map(toMapRoute) };
  }

  async pdf(query: SystemRoutesMapQuery): Promise<Buffer> {
    return this.renderer.render(toReportDocument({ map: await this.map(query), now: new Date() }));
  }
}
