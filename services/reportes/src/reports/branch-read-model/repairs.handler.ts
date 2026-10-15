import { type EventEnvelope, repairExpenseAddedPayloadSchema } from '@debus/contracts';
import { OnEvent, type SqlClient } from '@debus/messaging';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// An expense is immutable: its lines are kept once, numbered by their position.
const INSERT_LINE = `
  INSERT INTO branch_report_repair_lines (expense_id, line_no, branch_id, bus_id, service_date,
    category_id, category_name, kind, description, amount)
  VALUES ($1::uuid, $2, $3::uuid, $4::uuid, $5::date, $6::uuid, $7, $8, $9, $10)
  ON CONFLICT (expense_id, line_no) DO NOTHING`;

@Injectable()
export class RepairsHandler {
  constructor(private readonly prisma: PrismaService) {}

  @OnEvent('RepairExpenseAdded')
  async added(payload: unknown, _envelope: EventEnvelope, tx?: SqlClient): Promise<void> {
    const expense = repairExpenseAddedPayloadSchema.parse(payload);
    const client = tx ?? this.prisma;
    for (const [lineNo, line] of expense.lines.entries()) {
      await client.$executeRawUnsafe(
        INSERT_LINE,
        expense.expenseId,
        lineNo,
        expense.branchId,
        expense.busId,
        expense.serviceDate,
        line.categoryId,
        line.categoryName,
        line.kind,
        line.description,
        line.amount,
      );
    }
  }
}
