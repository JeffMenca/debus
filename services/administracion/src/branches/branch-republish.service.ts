import type { RepublishResult } from '@debus/contracts';
import { republishInPages, republishPageArgs } from '@debus/server';
import { Injectable } from '@nestjs/common';
import { AdminEvents } from '../common/admin-events';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toBranchPayload } from './branch-mappers';

// The other services keep a copy of each branch and only replace it with a higher version. Branches
// that existed before a service started keeping its copy are sent again with the version raised by one.
@Injectable()
export class BranchRepublishService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: AdminEvents,
  ) {}

  async republish(branchId?: string, correlationId?: string): Promise<RepublishResult> {
    const republished = await republishInPages<Prisma.TransactionClient>({
      findPage: (after) =>
        this.prisma.branch.findMany({ where: { id: branchId }, ...republishPageArgs(after) }),
      transaction: async (work) => {
        await this.prisma.$transaction(work);
      },
      publishOne: async (tx, id) => {
        const branch = await tx.branch.update({
          where: { id },
          data: { version: { increment: 1 } },
        });
        await this.events.branchChanged(
          tx,
          'BranchUpdated',
          toBranchPayload(branch),
          correlationId,
        );
      },
      flush: () => this.events.flush(),
    });
    return { republished };
  }
}
