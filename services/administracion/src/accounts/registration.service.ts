import { isUniqueViolation } from '@debus/server';
import type {
  LinkStatus,
  SetPasswordRequest,
  SignupRequest,
  UserRegisteredPayload,
} from '@debus/contracts';
import { BadRequestException, ConflictException, GoneException, Injectable } from '@nestjs/common';
import { Prisma, type User } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccountEvents } from './account-events';
import { AccountLinksService } from './account-links.service';
import { activationReason, linkState, type LinkState } from './account-rules';
import { hashPassword } from './crypto';
import { MESSAGES } from './messages';
import { toUserUpdated } from './user-snapshot';

export interface ClientProfile {
  dpi: string;
  phone: string;
  nit: string | null;
  address: string | null;
}

@Injectable()
export class RegistrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly links: AccountLinksService,
    private readonly events: AccountEvents,
  ) {}

  async signUp(input: SignupRequest, correlationId?: string): Promise<void> {
    // Another request may create the same email a moment earlier: the retry treats it as pending.
    await retryOnUniqueViolation(() => this.registerClient(input, correlationId));
  }

  async forgotPassword(email: string, correlationId?: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user?.status === 'ACTIVE') {
      await this.links.issue(user, 'PASSWORD_RESET', 'PASSWORD_RESET', correlationId);
    } else if (user?.status === 'PENDING') {
      await this.links.issue(user, 'ACTIVATION', activationReason(user), correlationId);
    }
  }

  async linkStatus(token: string, now = new Date()): Promise<LinkStatus> {
    const link = await this.links.find(token);
    const state = linkState(link, now);
    return link ? { state, purpose: link.purpose } : { state };
  }

  async renewLink(token: string, correlationId?: string, now = new Date()): Promise<void> {
    const link = await this.links.find(token);
    const state = linkState(link, now);
    if (!link || state === 'invalid') return;
    if (state === 'used') throw new ConflictException(MESSAGES.linkUsed);
    const { user } = link;
    if (link.purpose === 'ACTIVATION' && user.status === 'PENDING') {
      await this.links.issue(user, 'ACTIVATION', activationReason(user), correlationId, now);
    } else if (link.purpose === 'PASSWORD_RESET' && user.status === 'ACTIVE') {
      await this.links.issue(user, 'PASSWORD_RESET', 'PASSWORD_RESET', correlationId, now);
    }
  }

  async setPassword(
    input: SetPasswordRequest,
    correlationId?: string,
    now = new Date(),
  ): Promise<void> {
    const link = await this.links.find(input.token);
    const state = linkState(link, now);
    if (!link || state !== 'valid') throw linkError(state);
    const passwordHash = await hashPassword(input.password);

    if (link.purpose === 'ACTIVATION' && link.user.status === 'PENDING') {
      // Another activation may take the same NIT at the same moment: the retry finds it taken.
      await retryOnUniqueViolation(() => this.activate(link, passwordHash, correlationId, now));
      return this.events.flush();
    }
    if (link.purpose === 'PASSWORD_RESET' && link.user.status === 'ACTIVE') {
      return this.resetPassword(link, passwordHash, now);
    }
    throw new ConflictException(MESSAGES.linkUsed);
  }

  private async registerClient(input: SignupRequest, correlationId?: string): Promise<void> {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing?.status === 'ACTIVE') {
      return this.links.noticeAlreadyRegistered(existing, correlationId);
    }
    if (existing?.status === 'INACTIVE') return;
    // A public form must not rewrite what an admin entered, nor staff accounts.
    const rewritable = !existing || (existing.role === 'CLIENT' && existing.createdById === null);
    const user = rewritable ? await this.savePendingClient(input, existing) : existing;
    await this.links.issue(user, 'ACTIVATION', activationReason(user), correlationId);
  }

  private activate(
    link: LinkWithUser,
    passwordHash: string,
    correlationId: string | undefined,
    now: Date,
  ): Promise<void> {
    const { user } = link;
    return this.prisma.$transaction(async (tx) => {
      await claimLink(tx, link.id, now);
      const profile = user.role === 'CLIENT' ? (user.pendingProfile as ClientProfile | null) : null;
      const nit = await availableNit(tx, profile?.nit);
      const activated = await tx.user.updateMany({
        where: { id: user.id, status: 'PENDING' },
        data: {
          passwordHash,
          status: 'ACTIVE',
          activatedAt: now,
          pendingProfile: Prisma.JsonNull,
          nit,
          version: { increment: 1 },
        },
      });
      if (activated.count !== 1) throw new ConflictException(MESSAGES.linkUsed);
      await this.events.userRegistered(
        tx,
        registeredPayload(user, profile && { ...profile, nit }),
        correlationId,
      );
      // notificaciones takes no version from UserRegistered: a branch admin edited while pending was
      // announced as inactive, and only a higher version tells its copy it is active now.
      if (user.role === 'BRANCH_ADMIN') {
        const active = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
        await this.events.userUpdated(tx, toUserUpdated(active), correlationId);
      }
    });
  }

  private resetPassword(link: LinkWithUser, passwordHash: string, now: Date): Promise<void> {
    const { user } = link;
    return this.prisma.$transaction(async (tx) => {
      await claimLink(tx, link.id, now);
      const reset = await tx.user.updateMany({
        where: { id: user.id, status: 'ACTIVE' },
        data: { passwordHash, failedLoginCount: 0, lockedUntil: null },
      });
      if (reset.count !== 1) throw new ConflictException(MESSAGES.linkUsed);
      await tx.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: now },
      });
    });
  }

  private async savePendingClient(input: SignupRequest, existing: User | null): Promise<User> {
    // The NIT stays in the profile until activation: a pending account must not hold the unique value.
    const pendingProfile = {
      dpi: input.dpi,
      phone: input.phone,
      nit: input.nit ?? null,
      address: input.address ?? null,
    } satisfies ClientProfile;
    const data = { fullName: input.fullName, pendingProfile };
    return existing
      ? this.prisma.user.update({ where: { id: existing.id }, data })
      : this.prisma.user.create({ data: { ...data, email: input.email, role: 'CLIENT' } });
  }
}

type LinkWithUser = NonNullable<Awaited<ReturnType<AccountLinksService['find']>>>;

async function retryOnUniqueViolation(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    await action();
  }
}

function linkError(state: LinkState): Error {
  if (state === 'used') return new ConflictException(MESSAGES.linkUsed);
  if (state === 'expired') return new GoneException(MESSAGES.linkExpired);
  return new BadRequestException(MESSAGES.linkInvalid);
}

// A link works once: only the request that flips usedAt may continue, however many arrive together.
async function claimLink(tx: Prisma.TransactionClient, linkId: string, now: Date): Promise<void> {
  const claimed = await tx.accountLink.updateMany({
    where: { id: linkId, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  });
  if (claimed.count === 1) return;
  const current = await tx.accountLink.findUnique({ where: { id: linkId } });
  throw linkError(linkState(current, now));
}

// The NIT is unique per account and only an active account holds it; a taken one is dropped.
async function availableNit(
  tx: Prisma.TransactionClient,
  nit: string | null | undefined,
): Promise<string | null> {
  if (!nit) return null;
  const holder = await tx.user.findUnique({ where: { nit } });
  return holder ? null : nit;
}

function registeredPayload(user: User, profile: ClientProfile | null): UserRegisteredPayload {
  return {
    userId: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    branchId: user.branchId,
    profile,
    // The update that activated it raised the version by one.
    version: user.version + 1,
  };
}
