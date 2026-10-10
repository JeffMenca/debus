import { randomUUID } from 'node:crypto';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  type AuthTokens,
  type LoginRequest,
  REFRESH_TOKEN_TTL_DAYS,
  type SessionUser,
} from '@debus/contracts';
import { HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { MAX_FAILED_LOGINS, lockExpiry } from '../accounts/account-rules';
import { generateOpaqueToken, hashOpaqueToken, verifyPassword } from '../accounts/crypto';
import { MESSAGES } from '../accounts/messages';
import type { Prisma, RefreshToken, User } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessTokensService } from './access-tokens.service';

const DAY_MS = 86_400_000;

interface AttemptReservation {
  locked: boolean;
}

const sessionEnded = () => new UnauthorizedException(MESSAGES.sessionEnded);
const invalidCredentials = () => new UnauthorizedException(MESSAGES.invalidCredentials);
const accountLocked = () => new HttpException(MESSAGES.locked, HttpStatus.LOCKED);

export function toSessionUser(user: User): SessionUser {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    branchId: user.branchId,
  };
}

@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessTokens: AccessTokensService,
  ) {}

  async login(input: LoginRequest, now = new Date()): Promise<AuthTokens> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (!user || user.status !== 'ACTIVE' || !user.passwordHash) {
      await verifyPassword(null, input.password);
      throw invalidCredentials();
    }
    // Reserved before the password is checked, so in a burst only the first five attempts are ever
    // checked and the rest wait their turn in the database.
    const reservation = await this.reserveAttempt(user.id, now);
    if (!reservation) throw accountLocked();
    const passwordMatches = await verifyPassword(user.passwordHash, input.password);
    if (!passwordMatches) throw reservation.locked ? accountLocked() : invalidCredentials();
    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null },
    });
    return this.issue(this.prisma, user, randomUUID(), now);
  }

  async refresh(refreshToken: string, now = new Date()): Promise<AuthTokens> {
    const stored = await this.findStored(refreshToken);
    if (!stored || stored.revokedAt || stored.expiresAt <= now) throw sessionEnded();
    if (stored.usedAt) {
      await this.revokeFamily(stored.familyId, now);
      throw sessionEnded();
    }
    const outcome = await this.prisma.$transaction(async (tx) => {
      // A family with a revoked token is over: nothing in it may rotate again.
      const revoked = await tx.refreshToken.count({
        where: { familyId: stored.familyId, revokedAt: { not: null } },
      });
      if (revoked > 0) return 'ended';
      const claimed = await tx.refreshToken.updateMany({
        where: { id: stored.id, usedAt: null, revokedAt: null },
        data: { usedAt: now },
      });
      if (claimed.count === 0) return 'reused';
      const user = await tx.user.findUnique({ where: { id: stored.userId } });
      if (user?.status !== 'ACTIVE') return 'ended';
      // Claim and replacement commit together, so a revocation can never miss the new token.
      return this.issue(tx, user, stored.familyId, now);
    });
    if (outcome === 'reused') {
      // Runs after the winner committed (the claim waited for it), so its new token is revoked too.
      await this.revokeFamily(stored.familyId, now);
    }
    if (typeof outcome === 'string') throw sessionEnded();
    return outcome;
  }

  async logout(refreshToken: string, now = new Date()): Promise<void> {
    const stored = await this.findStored(refreshToken);
    if (stored) await this.revokeFamily(stored.familyId, now);
  }

  async me(userId: string): Promise<SessionUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (user?.status !== 'ACTIVE') throw sessionEnded();
    return toSessionUser(user);
  }

  private async issue(
    db: Pick<Prisma.TransactionClient, 'refreshToken'>,
    user: User,
    familyId: string,
    now: Date,
  ): Promise<AuthTokens> {
    const { token, hash } = generateOpaqueToken();
    const expiresAt = new Date(now.getTime() + REFRESH_TOKEN_TTL_DAYS * DAY_MS);
    await db.refreshToken.create({
      data: { userId: user.id, familyId, tokenHash: hash, expiresAt },
    });
    return {
      accessToken: this.accessTokens.sign(user),
      accessExpiresIn: ACCESS_TOKEN_TTL_SECONDS,
      refreshToken: token,
      refreshExpiresAt: expiresAt.toISOString(),
      user: toSessionUser(user),
    };
  }

  // One statement checks the lock, counts the attempt and sets the lock when it is the fifth, so
  // simultaneous requests cannot read the same count. No row back means the account is locked;
  // `locked` is true when this very attempt is the one that set the lock.
  private async reserveAttempt(userId: string, now: Date): Promise<AttemptReservation | null> {
    const rows = await this.prisma.$queryRaw<AttemptReservation[]>`
      UPDATE users SET
        failed_login_count = CASE WHEN failed_login_count + 1 >= ${MAX_FAILED_LOGINS} THEN 0 ELSE failed_login_count + 1 END,
        locked_until = CASE WHEN failed_login_count + 1 >= ${MAX_FAILED_LOGINS} THEN ${lockExpiry(now)}::timestamptz ELSE locked_until END
      WHERE id = ${userId}::uuid AND (locked_until IS NULL OR locked_until <= ${now}::timestamptz)
      RETURNING (failed_login_count = 0) AS locked`;
    return rows[0] ?? null;
  }

  private findStored(refreshToken: string): Promise<RefreshToken | null> {
    return this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashOpaqueToken(refreshToken) },
    });
  }

  private async revokeFamily(familyId: string, now: Date): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: now },
    });
  }
}
