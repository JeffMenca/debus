import type { SqlClient } from '@debus/messaging';
import type { Prisma } from '../generated/prisma/client';
import type { PrismaService } from './prisma.service';

// The inbox hands over its Prisma transaction; writing through it avoids a second pool connection.
export const inTransaction = (
  tx: SqlClient | undefined,
  prisma: PrismaService,
): Prisma.TransactionClient => (tx as Prisma.TransactionClient | undefined) ?? prisma;
