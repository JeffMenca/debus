import type { RepublishResult } from '@debus/contracts';
import { republishInPages, republishPageArgs } from '@debus/server';
import { Injectable } from '@nestjs/common';
import { FleetEvents } from '../common/fleet-events';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toDriverPayload } from './driver-mappers';

// Drivers that existed before a service started keeping its copy are sent again with the version
// raised by one.
@Injectable()
export class DriverRepublishService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: FleetEvents,
  ) {}

  async republish(branchId?: string, correlationId?: string): Promise<RepublishResult> {
    const republished = await republishInPages<Prisma.TransactionClient>({
      findPage: (after) =>
        this.prisma.driver.findMany({ where: { branchId: branchId }, ...republishPageArgs(after) }),
      transaction: async (work) => {
        await this.prisma.$transaction(work);
      },
      publishOne: async (tx, id) => {
        const row = await tx.driver.update({ where: { id }, data: { version: { increment: 1 } } });
        await this.events.driver(tx, 'DriverUpdated', toDriverPayload(row), correlationId);
      },
      flush: () => this.events.flush(),
    });
    return { republished };
  }
}
