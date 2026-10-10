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
import { isSerializationFailure, isUniqueViolation } from '../common/prisma-errors';
import type { User } from '../generated/prisma/client';
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
    // Two admins deactivating each other at once make the database abort one serializable
    // transaction; the second try sees the other change and answers with the real rule.
    try {
      return await this.deactivateOnce(id, now);
    } catch (error) {
      if (!isSerializationFailure(error)) throw error;
    }
    try {
      return await this.deactivateOnce(id, now);
    } catch (error) {
      if (isSerializationFailure(error)) throw new ConflictException(MESSAGES.busy);
      throw error;
    }
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

  private deactivateOnce(id: string, now: Date): Promise<void> {
    return this.prisma.$transaction(
      async (tx) => {
        const user = await tx.user.findUnique({ where: { id } });
        if (!user) throw new NotFoundException(MESSAGES.userNotFound);
        if (user.status === 'INACTIVE') return;
        const activeAdmins = await tx.user.count({
          where: { role: 'SYSTEM_ADMIN', status: 'ACTIVE' },
        });
        if (!canDeactivate(user, activeAdmins)) {
          throw new ConflictException(MESSAGES.lastSystemAdmin);
        }
        await tx.user.update({ where: { id }, data: { status: 'INACTIVE' } });
        await tx.refreshToken.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: now },
        });
      },
      { isolationLevel: 'Serializable' },
    );
  }
}
