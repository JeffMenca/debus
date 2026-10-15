import type { RepublishResult } from '@debus/contracts';
import { republishInPages, republishPageArgs } from '@debus/server';
import { Injectable } from '@nestjs/common';
import { FleetEvents } from '../common/fleet-events';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toBusPayload } from './bus-mappers';

// The other services keep a copy of each bus and only replace it with a higher version. Buses that
// existed before a service started keeping its copy are sent again with the version raised by one.
@Injectable()
export class BusRepublishService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: FleetEvents,
  ) {}

  async republish(branchId?: string, correlationId?: string): Promise<RepublishResult> {
    const republished = await republishInPages<Prisma.TransactionClient>({
      findPage: (after) =>
        this.prisma.bus.findMany({ where: { branchId }, ...republishPageArgs(after) }),
      transaction: async (work) => {
        await this.prisma.$transaction(work);
      },
      publishOne: async (tx, id) => {
        const bus = await tx.bus.update({ where: { id }, data: { version: { increment: 1 } } });
        await this.events.bus(tx, 'BusUpdated', toBusPayload(bus), correlationId);
      },
      flush: () => this.events.flush(),
    });
    return { republished };
  }
}
