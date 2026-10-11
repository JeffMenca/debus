import {
  type CreateSettingsRequest,
  type SettingsOverview,
  type SettingsVersion,
  effectiveVersion,
  todayInGuatemala,
} from '@debus/contracts';
import { BadRequestException, Injectable } from '@nestjs/common';
import { MESSAGES } from '../accounts/messages';
import { AdminEvents } from '../common/admin-events';
import type { Identity } from '../identity/identity';
import { PrismaService } from '../prisma/prisma.service';
import { fromDateOnly, toSettingsPayload, toSettingsVersion } from './settings-mappers';
import { canScheduleSettings } from './settings-rules';

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: AdminEvents,
  ) {}

  async overview(now = new Date()): Promise<SettingsOverview> {
    const rows = await this.prisma.settingsVersion.findMany({
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
    });
    const ids = [...new Set(rows.map((row) => row.createdById))];
    const authors = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, fullName: true },
    });
    const names = new Map(authors.map((author) => [author.id, author.fullName]));
    const versions = rows.map((row) => toSettingsVersion(row, names.get(row.createdById) ?? null));
    return { current: effectiveVersion(versions, todayInGuatemala(now)), versions };
  }

  async create(
    actor: Identity,
    input: CreateSettingsRequest,
    correlationId?: string,
    now = new Date(),
  ): Promise<SettingsVersion> {
    if (!canScheduleSettings(input.effectiveFrom, todayInGuatemala(now))) {
      throw new BadRequestException(MESSAGES.settingsPastDate);
    }
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.settingsVersion.create({
        data: {
          depreciationPerKm: input.depreciationPerKm,
          rentalRatePerKm: input.rentalRatePerKm,
          effectiveFrom: fromDateOnly(input.effectiveFrom),
          createdById: actor.userId,
        },
      });
      await this.events.settingsUpdated(tx, toSettingsPayload(created), correlationId);
      return created;
    });
    await this.events.flush();
    const author = await this.prisma.user.findUnique({
      where: { id: actor.userId },
      select: { fullName: true },
    });
    return toSettingsVersion(row, author?.fullName ?? null);
  }
}
