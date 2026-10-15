import type { RepublishResult } from '@debus/contracts';
import { republishInPages, republishPageArgs } from '@debus/server';
import { Injectable } from '@nestjs/common';
import { FleetEvents } from '../common/fleet-events';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toRoutePayload } from './route-mappers';

// Routes that existed before a service started keeping its copy are sent again with the version
// raised by one; a route belongs to the branch it leaves.
@Injectable()
export class RouteRepublishService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: FleetEvents,
  ) {}

  async republish(branchId?: string, correlationId?: string): Promise<RepublishResult> {
    const republished = await republishInPages<Prisma.TransactionClient>({
      findPage: (after) =>
        this.prisma.route.findMany({
          where: { originBranchId: branchId },
          ...republishPageArgs(after),
        }),
      transaction: async (work) => {
        await this.prisma.$transaction(work);
      },
      publishOne: async (tx, id) => {
        const row = await tx.route.update({ where: { id }, data: { version: { increment: 1 } } });
        await this.events.route(tx, 'RouteUpdated', toRoutePayload(row), correlationId);
      },
      flush: () => this.events.flush(),
    });
    return { republished };
  }
}
