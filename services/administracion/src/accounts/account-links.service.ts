import type { AccountLinkPurpose } from '@debus/contracts';
import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccountEvents } from './account-events';
import { HOUR_MS, LINK_TTL_MS, MAX_LINKS_PER_HOUR, canSendNotice } from './account-rules';
import { AUTH_SETTINGS, type AuthSettings } from './auth-settings';
import { generateOpaqueToken, hashOpaqueToken } from './crypto';

export interface LinkRecipient {
  id: string;
  email: string;
  fullName: string;
}

const PAGES: Record<AccountLinkPurpose, string> = {
  ACTIVATION: '/crear-contrasena',
  PASSWORD_RESET: '/restablecer',
};

function recipient(user: LinkRecipient) {
  return { userId: user.id, email: user.email, fullName: user.fullName };
}

export function linkUrl(webUrl: string, purpose: AccountLinkPurpose, token: string): string {
  return `${webUrl}${PAGES[purpose]}?token=${token}`;
}

@Injectable()
export class AccountLinksService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(AUTH_SETTINGS) private readonly settings: AuthSettings,
    private readonly events: AccountEvents,
  ) {}

  async issue(
    user: LinkRecipient,
    purpose: AccountLinkPurpose,
    reason: 'INVITATION' | 'SIGNUP' | 'PASSWORD_RESET',
    correlationId?: string,
    now = new Date(),
  ): Promise<boolean> {
    const recent = await this.prisma.accountLink.count({
      where: { userId: user.id, createdAt: { gt: new Date(now.getTime() - HOUR_MS) } },
    });
    if (recent >= MAX_LINKS_PER_HOUR) return false;

    await this.prisma.$transaction((tx) =>
      this.writeLink(tx, user, purpose, reason, correlationId, now),
    );
    await this.events.flush();
    return true;
  }

  // Writes the link and queues its email in the caller's transaction; the caller flushes afterwards.
  async writeLink(
    tx: Prisma.TransactionClient,
    user: LinkRecipient,
    purpose: AccountLinkPurpose,
    reason: 'INVITATION' | 'SIGNUP' | 'PASSWORD_RESET',
    correlationId?: string,
    now = new Date(),
  ): Promise<void> {
    const { token, hash } = generateOpaqueToken();
    const expiresAt = new Date(now.getTime() + LINK_TTL_MS[purpose]);
    await tx.accountLink.updateMany({
      where: { userId: user.id, purpose, usedAt: null, expiresAt: { gt: now } },
      data: { expiresAt: now },
    });
    await tx.accountLink.create({ data: { userId: user.id, purpose, tokenHash: hash, expiresAt } });
    await this.events.linkSent(
      tx,
      {
        ...recipient(user),
        reason,
        link: linkUrl(this.settings.webUrl, purpose, token),
        expiresAt: expiresAt.toISOString(),
      },
      correlationId,
    );
  }

  async noticeAlreadyRegistered(
    user: LinkRecipient & { lastNoticeAt: Date | null },
    correlationId?: string,
    now = new Date(),
  ): Promise<void> {
    if (!canSendNotice(user.lastNoticeAt, now)) return;
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { lastNoticeAt: now } });
      await this.events.linkSent(
        tx,
        { ...recipient(user), reason: 'ALREADY_REGISTERED' },
        correlationId,
      );
    });
    await this.events.flush();
  }

  find(token: string) {
    return this.prisma.accountLink.findUnique({
      where: { tokenHash: hashOpaqueToken(token) },
      include: { user: true },
    });
  }
}
