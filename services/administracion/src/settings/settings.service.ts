import type { Identity } from '@debus/server';
import {
  type CreateSettingsRequest,
  type SettingsListQuery,
  type SettingsPage,
  type SettingsVersion,
  pageArgs,
  toPage,
  todayInGuatemala,
} from '@debus/contracts';
import { BadRequestException, Injectable } from '@nestjs/common';
import { MESSAGES } from '../accounts/messages';
import { AdminEvents } from '../common/admin-events';
import type { SettingsVersion as SettingsVersionRow } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { fromDateOnly, toSettingsPayload, toSettingsVersion } from './settings-mappers';
import { canScheduleSettings } from './settings-rules';

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: AdminEvents,
  ) {}

  // The history is paged; the version in force and the next one come apart from the page,
  // so the screen shows them whichever page of the history is open.
  async list(query: SettingsListQuery, now = new Date()): Promise<SettingsPage> {
    const today = fromDateOnly(todayInGuatemala(now));
    const [rows, total, current, upcoming] = await this.prisma.$transaction([
      this.prisma.settingsVersion.findMany({
        orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
        ...pageArgs(query),
      }),
      this.prisma.settingsVersion.count(),
      this.prisma.settingsVersion.findFirst({
        where: { effectiveFrom: { lte: today } },
        orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.settingsVersion.findFirst({
        where: { effectiveFrom: { gt: today } },
        orderBy: [{ effectiveFrom: 'asc' }, { createdAt: 'desc' }],
      }),
    ]);
    const names = await this.authorNames([
      ...rows,
      ...(current ? [current] : []),
      ...(upcoming ? [upcoming] : []),
    ]);
    const view = (row: SettingsVersionRow) =>
      toSettingsVersion(row, names.get(row.createdById) ?? null);
    return {
      ...toPage(rows.map(view), total, query),
      summary: { current: current && view(current), upcoming: upcoming && view(upcoming) },
    };
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

  private async authorNames(rows: SettingsVersionRow[]): Promise<Map<string, string>> {
    const ids = [...new Set(rows.map((row) => row.createdById))];
    const authors = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, fullName: true },
    });
    return new Map(authors.map((author) => [author.id, author.fullName]));
  }
}
