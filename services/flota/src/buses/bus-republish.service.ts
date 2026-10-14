import type { RepublishBusesResult } from '@debus/contracts';
import { Injectable } from '@nestjs/common';
import { FleetEvents } from '../common/fleet-events';
import { PrismaService } from '../prisma/prisma.service';
import { toBusPayload } from './bus-mappers';

const PAGE_SIZE = 100;

// The other services keep a copy of each bus and only replace it with a higher version. Buses that
// existed before a service started keeping its copy are sent again with the version raised by one.
@Injectable()
export class BusRepublishService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: FleetEvents,
  ) {}

  async republish(branchId?: string, correlationId?: string): Promise<RepublishBusesResult> {
    let republished = 0;
    let cursor: { id: string } | undefined;
    for (;;) {
      const page = await this.prisma.bus.findMany({
        where: { branchId },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: PAGE_SIZE,
        ...(cursor && { cursor, skip: 1 }),
      });
      if (page.length === 0) break;
      await this.prisma.$transaction(async (tx) => {
        for (const { id } of page) {
          const bus = await tx.bus.update({ where: { id }, data: { version: { increment: 1 } } });
          await this.events.bus(tx, 'BusUpdated', toBusPayload(bus), correlationId);
        }
      });
      republished += page.length;
      cursor = { id: page[page.length - 1]!.id };
    }
    // What the short flush leaves behind goes out with the scheduled one.
    if (republished > 0) await this.events.flush();
    return { republished };
  }
}
