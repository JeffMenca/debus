import {
  type CreateExpenseCategoryRequest,
  type ExpenseCategory,
  type ExpenseCategoryListQuery,
  type ExpenseCategoryPage,
  type UpdateExpenseCategoryRequest,
  pageArgs,
  toPage,
} from '@debus/contracts';
import { isForeignKeyViolation, isRecordMissing, isUniqueViolation } from '@debus/server';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { categoryListWhere } from './category-rules';
import { EXPENSE_MESSAGES } from './expense-messages';

const WITH_USAGE = { _count: { select: { lines: true } } } as const;
type CategoryRow = Prisma.ExpenseCategoryGetPayload<{ include: typeof WITH_USAGE }>;

// The id breaks ties, so a category never shows up on two pages or on none.
const BY_NAME: Prisma.ExpenseCategoryOrderByWithRelationInput[] = [{ name: 'asc' }, { id: 'asc' }];

const toCategory = (row: CategoryRow): ExpenseCategory => ({
  id: row.id,
  name: row.name,
  active: row.active,
  inUse: row._count.lines > 0,
});

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ExpenseCategoryListQuery): Promise<ExpenseCategoryPage> {
    const where = categoryListWhere(query);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.expenseCategory.findMany({
        where,
        include: WITH_USAGE,
        orderBy: BY_NAME,
        ...pageArgs(query),
      }),
      this.prisma.expenseCategory.count({ where }),
    ]);
    return toPage(rows.map(toCategory), total, query);
  }

  async create(input: CreateExpenseCategoryRequest): Promise<ExpenseCategory> {
    const row = await this.translateErrors(() =>
      this.prisma.expenseCategory.create({ data: input, include: WITH_USAGE }),
    );
    return toCategory(row);
  }

  async update(id: string, input: UpdateExpenseCategoryRequest): Promise<ExpenseCategory> {
    const row = await this.translateErrors(() =>
      this.prisma.expenseCategory.update({ where: { id }, data: input, include: WITH_USAGE }),
    );
    return toCategory(row);
  }

  async remove(id: string): Promise<void> {
    await this.translateErrors(() => this.prisma.expenseCategory.delete({ where: { id } }));
  }

  // The unique index and the foreign key decide, so two admins at the same time cannot slip through.
  private async translateErrors<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(EXPENSE_MESSAGES.categoryNameTaken);
      }
      if (isForeignKeyViolation(error)) throw new ConflictException(EXPENSE_MESSAGES.categoryInUse);
      if (isRecordMissing(error)) throw new NotFoundException(EXPENSE_MESSAGES.categoryNotFound);
      throw error;
    }
  }
}
