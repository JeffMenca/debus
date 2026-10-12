import {
  type Branch,
  type BranchListQuery,
  type BranchPage,
  type BranchWithAdmins,
  type BranchWithAdminsPage,
  type CreateBranchRequest,
  type UpdateBranchRequest,
  pageArgs,
  toPage,
} from '@debus/contracts';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccountLinksService } from '../accounts/account-links.service';
import { lockBranchAdmins } from '../accounts/admin-locks';
import { MESSAGES } from '../accounts/messages';
import { AdminEvents } from '../common/admin-events';
import { isUniqueViolation } from '../common/prisma-errors';
import type { Prisma } from '../generated/prisma/client';
import type { Identity } from '../identity/identity';
import { PrismaService } from '../prisma/prisma.service';
import { WITH_ADMINS, toBranch, toBranchPayload, toBranchWithAdmins } from './branch-mappers';
import { canViewBranch } from './branch-rules';
import { branchCountWhere, branchListWhere, toBranchStatusCounts } from './branch-scope';

// The id breaks ties, so a branch never shows up on two pages or on none.
const BY_NAME: Prisma.BranchOrderByWithRelationInput[] = [{ name: 'asc' }, { id: 'asc' }];

@Injectable()
export class BranchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly links: AccountLinksService,
    private readonly events: AdminEvents,
  ) {}

  // Admins are staff personal data: only a system admin receives them, in lists and in details.
  async list(actor: Identity, query: BranchListQuery): Promise<BranchPage | BranchWithAdminsPage> {
    const where = branchListWhere(actor, query);
    const paging = { where, orderBy: BY_NAME, ...pageArgs(query) };
    const totals = [
      this.prisma.branch.count({ where }),
      this.prisma.branch.groupBy({
        by: ['active'],
        where: branchCountWhere(actor, query),
        orderBy: { active: 'asc' },
        _count: { _all: true },
      }),
    ] as const;
    if (actor.role !== 'SYSTEM_ADMIN') {
      const [rows, total, byActive] = await this.prisma.$transaction([
        this.prisma.branch.findMany(paging),
        ...totals,
      ]);
      return {
        ...toPage(rows.map(toBranch), total, query),
        summary: { statusCounts: toBranchStatusCounts(byActive) },
      };
    }
    const [rows, total, byActive] = await this.prisma.$transaction([
      this.prisma.branch.findMany({ ...paging, include: WITH_ADMINS }),
      ...totals,
    ]);
    return {
      ...toPage(rows.map(toBranchWithAdmins), total, query),
      summary: { statusCounts: toBranchStatusCounts(byActive) },
    };
  }

  async get(actor: Identity, id: string): Promise<Branch> {
    if (!canViewBranch(actor, id)) throw new ForbiddenException(MESSAGES.forbidden);
    if (actor.role !== 'SYSTEM_ADMIN') {
      return toBranch(this.found(await this.prisma.branch.findUnique({ where: { id } })));
    }
    const row = await this.prisma.branch.findUnique({ where: { id }, include: WITH_ADMINS });
    return toBranchWithAdmins(this.found(row));
  }

  async create(
    actor: Identity,
    input: CreateBranchRequest,
    correlationId?: string,
  ): Promise<BranchWithAdmins> {
    const { admin, ...fields } = input;
    await this.assertBranchAvailable(fields.code, fields.name);
    if (await this.prisma.user.findUnique({ where: { email: admin.email } })) {
      throw new ConflictException(MESSAGES.emailTaken);
    }
    const row = await this.translateUniqueViolation(() =>
      this.prisma.$transaction(async (tx) => {
        const branch = await tx.branch.create({ data: { ...fields, createdById: actor.userId } });
        const user = await tx.user
          .create({
            data: {
              email: admin.email,
              fullName: admin.fullName,
              role: 'BRANCH_ADMIN',
              branchId: branch.id,
              createdById: actor.userId,
            },
          })
          .catch((error: unknown) => {
            // Another request took the email between the check above and this insert.
            if (isUniqueViolation(error)) throw new ConflictException(MESSAGES.emailTaken);
            throw error;
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
    return toBranchWithAdmins(row);
  }

  async update(
    id: string,
    input: UpdateBranchRequest,
    correlationId?: string,
  ): Promise<BranchWithAdmins> {
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
    return toBranchWithAdmins(row);
  }

  async setActive(id: string, active: boolean, correlationId?: string): Promise<void> {
    const changed = await this.prisma.$transaction(async (tx) => {
      const current = this.found(await tx.branch.findUnique({ where: { id } }));
      if (current.active === active) return false;
      if (active) await this.assertHasAdmin(tx, id);
      const updated = await tx.branch.update({
        where: { id },
        data: { active, version: { increment: 1 } },
      });
      await this.events.branchChanged(tx, 'BranchUpdated', toBranchPayload(updated), correlationId);
      return true;
    });
    if (changed) await this.events.flush();
  }

  // Locks the admins first, so deactivating the last one at the same time cannot slip through.
  private async assertHasAdmin(tx: Prisma.TransactionClient, branchId: string): Promise<void> {
    await lockBranchAdmins(tx, branchId);
    const admins = await tx.user.count({
      where: { role: 'BRANCH_ADMIN', branchId, status: { not: 'INACTIVE' } },
    });
    if (admins === 0) throw new ConflictException(MESSAGES.branchNeedsAdmin);
  }

  private found<T>(row: T | null): T {
    if (!row) throw new NotFoundException(MESSAGES.branchNotFound);
    return row;
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
