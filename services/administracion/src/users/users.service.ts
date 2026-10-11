import type { CreateUserRequest, ManagedUser } from '@debus/contracts';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccountLinksService } from '../accounts/account-links.service';
import { canCreateRole, canDeactivate } from '../accounts/account-rules';
import { MESSAGES } from '../accounts/messages';
import { isUniqueViolation } from '../common/prisma-errors';
import type { Prisma, User } from '../generated/prisma/client';
import type { Identity } from '../identity/identity';
import { PrismaService } from '../prisma/prisma.service';

export function toManagedUser(user: User): ManagedUser {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    branchId: user.branchId,
    status: user.status,
  };
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly links: AccountLinksService,
  ) {}

  async create(
    actor: Identity,
    input: CreateUserRequest,
    correlationId?: string,
  ): Promise<ManagedUser> {
    if (!canCreateRole(actor, input)) {
      throw new ForbiddenException(MESSAGES.forbidden);
    }
    if (await this.prisma.user.findUnique({ where: { email: input.email } })) {
      throw new ConflictException(MESSAGES.emailTaken);
    }
    // The NIT stays in the pending profile; the account holds it only once activated.
    const profile =
      input.role === 'CLIENT'
        ? {
            dpi: input.dpi!,
            phone: input.phone!,
            nit: input.nit ?? null,
            address: input.address ?? null,
          }
        : undefined;
    let user: User;
    try {
      user = await this.prisma.user.create({
        data: {
          email: input.email,
          fullName: input.fullName,
          role: input.role,
          branchId: input.branchId ?? null,
          createdById: actor.userId,
          ...(profile && { pendingProfile: profile }),
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException(MESSAGES.emailTaken);
      throw error;
    }
    await this.links.issue(user, 'ACTIVATION', 'INVITATION', correlationId);
    return toManagedUser(user);
  }

  async deactivate(id: string, now = new Date()): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const found = await tx.user.findUnique({ where: { id } });
      if (!found) throw new NotFoundException(MESSAGES.userNotFound);
      let status = found.status;
      // Deactivating an admin must see the other admins' changes: whoever holds the lock decides
      // first and the rest wait, then read the status again with what was committed meanwhile.
      if (found.role === 'SYSTEM_ADMIN') {
        await this.lockActiveSystemAdmins(tx);
        const current = await tx.user.findUniqueOrThrow({
          where: { id },
          select: { status: true },
        });
        status = current.status;
      }
      if (status === 'INACTIVE') return;
      const activeAdmins = await tx.user.count({
        where: { role: 'SYSTEM_ADMIN', status: 'ACTIVE' },
      });
      if (!canDeactivate({ role: found.role, status }, activeAdmins)) {
        throw new ConflictException(MESSAGES.lastSystemAdmin);
      }
      await tx.user.update({ where: { id }, data: { status: 'INACTIVE' } });
      await tx.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: now },
      });
    });
  }

  async reactivate(id: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException(MESSAGES.userNotFound);
    if (user.status !== 'INACTIVE') return;
    await this.prisma.user.update({
      where: { id },
      data: { status: user.passwordHash ? 'ACTIVE' : 'PENDING' },
    });
  }

  // Always in the same order, so two transactions can never wait on each other in a loop.
  private async lockActiveSystemAdmins(tx: Prisma.TransactionClient): Promise<void> {
    await tx.$queryRaw`SELECT id FROM users WHERE role = 'SYSTEM_ADMIN' AND status = 'ACTIVE' ORDER BY id FOR UPDATE`;
  }
}
