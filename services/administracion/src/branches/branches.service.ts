import type { Branch, CreateBranchRequest, UpdateBranchRequest } from '@debus/contracts';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccountLinksService } from '../accounts/account-links.service';
import { MESSAGES } from '../accounts/messages';
import { AdminEvents } from '../common/admin-events';
import { isUniqueViolation } from '../common/prisma-errors';
import type { Identity } from '../identity/identity';
import { PrismaService } from '../prisma/prisma.service';
import { WITH_ADMINS, toBranch, toBranchPayload } from './branch-mappers';
import { canViewBranch } from './branch-rules';

@Injectable()
export class BranchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly links: AccountLinksService,
    private readonly events: AdminEvents,
  ) {}

  async list(actor: Identity, includeInactive: boolean): Promise<Branch[]> {
    const showInactive = includeInactive && actor.role === 'SYSTEM_ADMIN';
    const rows = await this.prisma.branch.findMany({
      where: showInactive ? {} : { active: true },
      include: WITH_ADMINS,
      orderBy: { name: 'asc' },
    });
    return rows.map(toBranch);
  }

  async get(actor: Identity, id: string): Promise<Branch> {
    if (!canViewBranch(actor, id)) throw new ForbiddenException(MESSAGES.forbidden);
    const row = await this.prisma.branch.findUnique({ where: { id }, include: WITH_ADMINS });
    if (!row) throw new NotFoundException(MESSAGES.branchNotFound);
    return toBranch(row);
  }

  async create(
    actor: Identity,
    input: CreateBranchRequest,
    correlationId?: string,
  ): Promise<Branch> {
    const { admin, ...fields } = input;
    await this.assertBranchAvailable(fields.code, fields.name);
    if (await this.prisma.user.findUnique({ where: { email: admin.email } })) {
      throw new ConflictException(MESSAGES.emailTaken);
    }
    const row = await this.translateUniqueViolation(() =>
      this.prisma.$transaction(async (tx) => {
        const branch = await tx.branch.create({ data: { ...fields, createdById: actor.userId } });
        const user = await tx.user.create({
          data: {
            email: admin.email,
            fullName: admin.fullName,
            role: 'BRANCH_ADMIN',
            branchId: branch.id,
            createdById: actor.userId,
          },
        });
        await this.links.writeLink(tx, user, 'ACTIVATION', 'INVITATION', correlationId);
        await this.events.branchChanged(
          tx,
          'BranchCreated',
          toBranchPayload(branch),
          correlationId,
        );
        return tx.branch.findUniqueOrThrow({ where: { id: branch.id }, include: WITH_ADMINS });
      }),
    );
    await this.events.flush();
    return toBranch(row);
  }

  async update(id: string, input: UpdateBranchRequest, correlationId?: string): Promise<Branch> {
    await this.assertBranchAvailable(input.code, input.name, id);
    const row = await this.translateUniqueViolation(() =>
      this.prisma.$transaction(async (tx) => {
        if (!(await tx.branch.findUnique({ where: { id } }))) {
          throw new NotFoundException(MESSAGES.branchNotFound);
        }
        const updated = await tx.branch.update({
          where: { id },
          data: { ...input, version: { increment: 1 } },
          include: WITH_ADMINS,
        });
        await this.events.branchChanged(
          tx,
          'BranchUpdated',
          toBranchPayload(updated),
          correlationId,
        );
        return updated;
      }),
    );
    await this.events.flush();
    return toBranch(row);
  }

  async setActive(id: string, active: boolean, correlationId?: string): Promise<void> {
    const changed = await this.prisma.$transaction(async (tx) => {
      const current = await tx.branch.findUnique({ where: { id } });
      if (!current) throw new NotFoundException(MESSAGES.branchNotFound);
      if (current.active === active) return false;
      const updated = await tx.branch.update({
        where: { id },
        data: { active, version: { increment: 1 } },
      });
      await this.events.branchChanged(tx, 'BranchUpdated', toBranchPayload(updated), correlationId);
      return true;
    });
    if (changed) await this.events.flush();
  }

  // The unique indexes catch what assertBranchAvailable could not: two admins saving at once.
  private async translateUniqueViolation<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException(MESSAGES.branchTaken);
      throw error;
    }
  }

  // Friendly messages first; the unique indexes still guard against two admins at the same time.
  private async assertBranchAvailable(
    code?: string,
    name?: string,
    exceptId?: string,
  ): Promise<void> {
    const others = exceptId ? { id: { not: exceptId } } : {};
    if (code && (await this.prisma.branch.findFirst({ where: { code, ...others } }))) {
      throw new ConflictException(MESSAGES.branchCodeTaken);
    }
    if (name && (await this.prisma.branch.findFirst({ where: { name, ...others } }))) {
      throw new ConflictException(MESSAGES.branchNameTaken);
    }
  }
}
