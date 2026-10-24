import { type SystemBusOptionsPage, type SystemBusOptionsQuery, toPage } from '@debus/contracts';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  type BusOptionRecord,
  type BusOptionsTotalsRecord,
  toBusOptionRow,
} from './system-bus-options.rows';
import { busOptionsPageQuery, busOptionsTotalsQuery } from './system-bus-options.sql';

@Injectable()
export class SystemBusOptionsService {
  constructor(private readonly prisma: PrismaService) {}

  async page(query: SystemBusOptionsQuery): Promise<SystemBusOptionsPage> {
    const [records, totalsRecords] = await this.prisma.$transaction([
      this.prisma.$queryRaw<BusOptionRecord[]>(busOptionsPageQuery(query)),
      this.prisma.$queryRaw<BusOptionsTotalsRecord[]>(busOptionsTotalsQuery(query)),
    ]);
    const buses = totalsRecords[0]?.buses ?? 0;
    return {
      ...toPage(records.map(toBusOptionRow), buses, query),
      summary: { totals: { buses }, groups: [] },
    };
  }
}
