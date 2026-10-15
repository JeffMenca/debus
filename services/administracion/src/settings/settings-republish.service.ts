import type { RepublishResult } from '@debus/contracts';
import { republishInPages, republishPageArgs } from '@debus/server';
import { Injectable } from '@nestjs/common';
import { AdminEvents } from '../common/admin-events';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toSettingsPayload } from './settings-mappers';

// Settings versions never change, so they go out again exactly as they are, with their own version
// id: the services that keep a copy insert by that id and ignore the ones they already have.
@Injectable()
export class SettingsRepublishService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: AdminEvents,
  ) {}

  async republish(correlationId?: string): Promise<RepublishResult> {
    const republished = await republishInPages<Prisma.TransactionClient>({
      findPage: (after) => this.prisma.settingsVersion.findMany(republishPageArgs(after)),
      transaction: async (work) => {
        await this.prisma.$transaction(work);
      },
      publishOne: async (tx, id) => {
        const version = await tx.settingsVersion.findUniqueOrThrow({ where: { id } });
        await this.events.settingsUpdated(tx, toSettingsPayload(version), correlationId);
      },
      flush: () => this.events.flush(),
    });
    return { republished };
  }
}
