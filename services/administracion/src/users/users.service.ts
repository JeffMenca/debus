import {
  type CreateUserRequest,
  type ManagedUser,
  type UpdateUserRequest,
  type UserListQuery,
  type UserRole,
  isBranchRole,
} from '@debus/contracts';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccountLinksService } from '../accounts/account-links.service';
import { canCreateRole, canDeactivate, leavesBranchWithoutAdmin } from '../accounts/account-rules';
import { lockActiveSystemAdmins, lockBranchAdmins } from '../accounts/admin-locks';
import { MESSAGES } from '../accounts/messages';
import { canLinkToBranch } from '../branches/branch-rules';
import { isUniqueViolation } from '../common/prisma-errors';
import type { Prisma, User } from '../generated/prisma/client';
import type { Identity } from '../identity/identity';
import { PrismaService } from '../prisma/prisma.service';
import { userListWhere } from './user-scope';

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
    if (input.branchId) await this.assertLinkableBranch(this.prisma, input.role, input.branchId);
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
      const found = await this.findUser(tx, id);
      const user = await this.lockPeers(tx, found);
      if (user.status === 'INACTIVE') return;
      const activeAdmins = await tx.user.count({
        where: { role: 'SYSTEM_ADMIN', status: 'ACTIVE' },
      });
      if (!canDeactivate({ role: user.role, status: user.status }, activeAdmins)) {
        throw new ConflictException(MESSAGES.lastSystemAdmin);
      }
      await this.assertKeepsBranchAdmin(tx, user);
      await tx.user.update({ where: { id }, data: { status: 'INACTIVE' } });
      await tx.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: now },
      });
    });
  }

  async reactivate(id: string): Promise<void> {
    const user = await this.findUser(this.prisma, id);
    if (user.status !== 'INACTIVE') return;
    if (isBranchRole(user.role)) await this.assertBranchUsable(user.role, user.branchId);
    await this.prisma.user.update({
      where: { id },
      data: { status: user.passwordHash ? 'ACTIVE' : 'PENDING' },
    });
  }

  async list(actor: Identity, query: UserListQuery): Promise<ManagedUser[]> {
    const users = await this.prisma.user.findMany({
      where: userListWhere(actor, query),
      orderBy: { fullName: 'asc' },
    });
    return users.map(toManagedUser);
  }

  async get(actor: Identity, id: string): Promise<ManagedUser> {
    return toManagedUser(await this.findVisible(actor, id));
  }

  update(id: string, input: UpdateUserRequest): Promise<ManagedUser> {
    return this.prisma.$transaction(async (tx) => {
      const found = await this.findUser(tx, id);
      if (input.branchId !== undefined && input.branchId !== found.branchId) {
        if (!isBranchRole(found.role)) throw new BadRequestException(MESSAGES.branchNotAllowed);
        await this.assertLinkableBranch(tx, found.role, input.branchId);
        // The lock gives the fresh branch: another admin may have moved this one meanwhile.
        const user = await this.lockPeers(tx, found);
        if (input.branchId !== user.branchId) await this.assertKeepsBranchAdmin(tx, user);
      }
      return toManagedUser(await tx.user.update({ where: { id }, data: input }));
    });
  }

  async resendInvitation(
    actor: Identity,
    id: string,
    correlationId?: string,
  ): Promise<{ message: string }> {
    const user = await this.findVisible(actor, id);
    if (user.status === 'ACTIVE') throw new ConflictException(MESSAGES.accountAlreadyActive);
    if (user.status === 'INACTIVE') throw new ConflictException(MESSAGES.accountInactive);
    const sent = await this.links.issue(user, 'ACTIVATION', 'INVITATION', correlationId);
    if (!sent) throw new HttpException(MESSAGES.tooManyEmails, HttpStatus.TOO_MANY_REQUESTS);
    return { message: MESSAGES.invitationSent };
  }

  private async findUser(
    client: Pick<Prisma.TransactionClient, 'user'>,
    id: string,
  ): Promise<User> {
    const user = await client.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException(MESSAGES.userNotFound);
    return user;
  }

  private async findVisible(actor: Identity, id: string): Promise<User> {
    const user = await this.prisma.user.findFirst({
      where: { AND: [userListWhere(actor, {}), { id }] },
    });
    if (!user) throw new NotFoundException(MESSAGES.userNotFound);
    return user;
  }

  // Admins that others depend on are locked so the check below sees what was committed
  // meanwhile; the rest of the roles need no lock. Returns the row as it is under the lock.
  private async lockPeers(tx: Prisma.TransactionClient, user: User): Promise<User> {
    if (user.role === 'SYSTEM_ADMIN') {
      await lockActiveSystemAdmins(tx);
    } else if (user.role === 'BRANCH_ADMIN' && user.branchId) {
      await lockBranchAdmins(tx, user.branchId);
    } else {
      return user;
    }
    const current = await tx.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { status: true, branchId: true },
    });
    return { ...user, ...current };
  }

  private async assertKeepsBranchAdmin(tx: Prisma.TransactionClient, user: User): Promise<void> {
    if (user.role !== 'BRANCH_ADMIN' || !user.branchId) return;
    const branch = await tx.branch.findUnique({ where: { id: user.branchId } });
    const others = await tx.user.count({
      where: {
        role: 'BRANCH_ADMIN',
        branchId: user.branchId,
        status: { not: 'INACTIVE' },
        id: { not: user.id },
      },
    });
    if (leavesBranchWithoutAdmin(user, branch?.active ?? false, others)) {
      throw new ConflictException(MESSAGES.lastBranchAdmin);
    }
  }

  private async assertLinkableBranch(
    client: Pick<Prisma.TransactionClient, 'branch'>,
    role: UserRole,
    branchId: string,
  ): Promise<void> {
    const branch = await client.branch.findUnique({ where: { id: branchId } });
    if (!canLinkToBranch(role, branch)) throw new BadRequestException(MESSAGES.branchUnavailable);
  }

  // The branch of an existing account is not data the caller sent, so a bad one is a conflict.
  private async assertBranchUsable(role: UserRole, branchId: string | null): Promise<void> {
    const branch = branchId
      ? await this.prisma.branch.findUnique({ where: { id: branchId } })
      : null;
    if (!canLinkToBranch(role, branch)) throw new ConflictException(MESSAGES.branchUnavailable);
  }
}
