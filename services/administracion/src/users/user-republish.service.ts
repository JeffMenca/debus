import type { RepublishResult } from '@debus/contracts';
import { republishInPages, republishPageArgs } from '@debus/server';
import { Injectable } from '@nestjs/common';
import { AccountEvents } from '../accounts/account-events';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toUserUpdated } from '../accounts/user-snapshot';

// For a deploy that adds a copy of the accounts (notificaciones warns branch admins about licences,
// clientes rebuilds the profile of any account that lost it): each one goes out again with its
// version raised, so a copy that already has it takes it too.
@Injectable()
export class UserRepublishService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: AccountEvents,
  ) {}

  async republish(branchId?: string, correlationId?: string): Promise<RepublishResult> {
    const republished = await republishInPages<Prisma.TransactionClient>({
      findPage: (after) =>
        this.prisma.user.findMany({
          where: { branchId },
          ...republishPageArgs(after),
        }),
      transaction: async (work) => {
        await this.prisma.$transaction(work);
      },
      publishOne: async (tx, id) => {
        const user = await tx.user.update({ where: { id }, data: { version: { increment: 1 } } });
        await this.events.userUpdated(tx, toUserUpdated(user), correlationId);
      },
      flush: () => this.events.flush(),
    });
    return { republished };
  }
}
