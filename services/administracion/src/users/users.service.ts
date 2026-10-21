import { isUniqueViolation, type Identity, SERVER_MESSAGES } from '@debus/server';
import {
  type CreateUserRequest,
  type ManagedUser,
  type UpdateUserRequest,
  type UserListQuery,
  type UserPage,
  type UserRole,
  isBranchRole,
  pageArgs,
  toPage,
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
import { AccountEvents } from '../accounts/account-events';
import { AccountLinksService } from '../accounts/account-links.service';
import {
  canCreateRole,
  canDeactivate,
  isManagedByFleet,
  leavesBranchWithoutAdmin,
} from '../accounts/account-rules';
import { lockActiveSystemAdmins, lockBranchAdmins } from '../accounts/admin-locks';
import { MESSAGES } from '../accounts/messages';
import { toUserUpdated } from '../accounts/user-snapshot';
import { canLinkToBranch } from '../branches/branch-rules';
import type { Prisma, User } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toStatusCounts } from './user-counts';
import { userCountWhere, userListWhere } from './user-scope';

const BRANCH_LOCK_ATTEMPTS = 3;

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

const NEXT_VERSION = { version: { increment: 1 } } as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly links: AccountLinksService,
    private readonly events: AccountEvents,
  ) {}

  async create(
    actor: Identity,
    input: CreateUserRequest,
    correlationId?: string,
  ): Promise<ManagedUser> {
    if (!canCreateRole(actor, input)) {
      throw new ForbiddenException(SERVER_MESSAGES.forbidden);
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
    const changed = await this.prisma.$transaction(async (tx) => {
      const found = await this.findChangeable(tx, id);
      const user = await this.lockPeers(tx, found);
      if (user.status === 'INACTIVE') return false;
      const activeAdmins = await tx.user.count({
        where: { role: 'SYSTEM_ADMIN', status: 'ACTIVE' },
      });
      if (!canDeactivate({ role: user.role, status: user.status }, activeAdmins)) {
        throw new ConflictException(MESSAGES.lastSystemAdmin);
      }
      await this.assertKeepsBranchAdmin(tx, user);
      await this.announce(
        tx,
        await tx.user.update({ where: { id }, data: { status: 'INACTIVE', ...NEXT_VERSION } }),
      );
      await tx.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: now },
      });
      return true;
    });
    if (changed) await this.events.flush();
  }

  async reactivate(id: string): Promise<void> {
    const changed = await this.prisma.$transaction(async (tx) => {
      const user = await this.findChangeable(tx, id);
      if (user.status !== 'INACTIVE') return false;
      if (isBranchRole(user.role)) await this.assertBranchUsable(user.role, user.branchId);
      const status = user.passwordHash ? 'ACTIVE' : 'PENDING';
      await this.announce(
        tx,
        await tx.user.update({ where: { id }, data: { status, ...NEXT_VERSION } }),
      );
      return true;
    });
    if (changed) await this.events.flush();
  }

  async list(actor: Identity, query: UserListQuery): Promise<UserPage> {
    const where = userListWhere(actor, query);
    const [rows, total, byStatus] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        include: { branch: { select: { name: true } } },
        orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
        ...pageArgs(query),
      }),
      this.prisma.user.count({ where }),
      this.prisma.user.groupBy({
        by: ['status'],
        where: userCountWhere(actor, query),
        orderBy: { status: 'asc' },
        _count: { _all: true },
      }),
    ]);
    const items = rows.map((row) => ({
      ...toManagedUser(row),
      branchName: row.branch?.name ?? null,
    }));
    return { ...toPage(items, total, query), summary: { statusCounts: toStatusCounts(byStatus) } };
  }

  async get(actor: Identity, id: string): Promise<ManagedUser> {
    return toManagedUser(await this.findVisible(actor, id));
  }

  async update(id: string, input: UpdateUserRequest): Promise<ManagedUser> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const found = await this.findChangeable(tx, id);
      if (input.branchId !== undefined && input.branchId !== found.branchId) {
        if (!isBranchRole(found.role)) throw new BadRequestException(MESSAGES.branchNotAllowed);
        await this.assertLinkableBranch(tx, found.role, input.branchId);
        // The lock gives the fresh branch: another admin may have moved this one meanwhile.
        const user = await this.lockPeers(tx, found);
        if (input.branchId !== user.branchId) await this.assertKeepsBranchAdmin(tx, user);
      }
      const user = await tx.user.update({ where: { id }, data: { ...input, ...NEXT_VERSION } });
      await this.announce(tx, user);
      return toManagedUser(user);
    });
    await this.events.flush();
    return updated;
  }

  // The copies of other services (the branch admins of notificaciones) follow every change.
  private announce(tx: Prisma.TransactionClient, user: User): Promise<void> {
    return this.events.userUpdated(tx, toUserUpdated(user));
  }

  async resendInvitation(
    actor: Identity,
    id: string,
    correlationId?: string,
  ): Promise<{ message: string }> {
    const user = await this.findVisible(actor, id);
    if (isManagedByFleet(user)) throw new ConflictException(MESSAGES.managedByFleet);
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

  // The accounts of drivers change only through flota, so every change made here refuses them.
  private async findChangeable(
    client: Pick<Prisma.TransactionClient, 'user'>,
    id: string,
  ): Promise<User> {
    const user = await this.findUser(client, id);
    if (isManagedByFleet(user)) throw new ConflictException(MESSAGES.managedByFleet);
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
      const current = await tx.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { status: true },
      });
      return { ...user, ...current };
    }
    if (user.role !== 'BRANCH_ADMIN' || !user.branchId) return user;
    // The branch read before the lock may be stale: lock again until the row and the lock agree.
    let branchId: string | null = user.branchId;
    for (let attempt = 0; attempt < BRANCH_LOCK_ATTEMPTS && branchId; attempt++) {
      await lockBranchAdmins(tx, branchId);
      const current = await tx.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { status: true, branchId: true },
      });
      if (current.branchId === branchId) return { ...user, ...current };
      branchId = current.branchId;
    }
    throw new ConflictException(MESSAGES.busy);
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
