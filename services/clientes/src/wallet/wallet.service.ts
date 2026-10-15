import { randomUUID } from 'node:crypto';
import {
  type TopUpRequest,
  type Wallet,
  type WalletDebit,
  type WalletDebitRequest,
  type WalletMovement,
  type WalletMovementListQuery,
  type WalletMovementPage,
  pageArgs,
  toPage,
} from '@debus/contracts';
import { SERVER_MESSAGES, isUniqueViolation } from '@debus/server';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type {
  Prisma,
  Wallet as WalletRow,
  WalletMovement as MovementRow,
} from '../generated/prisma/client';
import { MESSAGES } from '../messages';
import { PrismaService } from '../prisma/prisma.service';
import {
  type MovementIntent,
  assertSameIntent,
  movementFingerprint,
  signedAmount,
} from './wallet-rules';

interface Applied {
  movementId: string;
  balance: number;
}

const day = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

const toWallet = (row: WalletRow): Wallet => ({
  balance: row.balance.toNumber(),
  updatedAt: row.updatedAt.toISOString(),
});

const toMovement = (row: MovementRow): WalletMovement => ({
  id: row.id,
  kind: row.kind,
  amount: row.amount.toNumber(),
  balanceAfter: row.balanceAfter.toNumber(),
  reference: row.reference,
  description: row.description,
  occurredOn: row.occurredOn.toISOString().slice(0, 10),
  createdAt: row.createdAt.toISOString(),
});

const replayed = (row: MovementRow, fingerprint: string): Applied => {
  assertSameIntent(row, fingerprint);
  return { movementId: row.id, balance: row.balanceAfter.toNumber() };
};

function movementFilter(clientId: string, query: WalletMovementListQuery) {
  const { kind, from, to } = query as WalletMovementListQuery & { from?: string; to?: string };
  return {
    clientId,
    ...(kind !== 'all' && { kind }),
    ...((from || to) && {
      occurredOn: { ...(from && { gte: day(from) }), ...(to && { lte: day(to) }) },
    }),
  } satisfies Prisma.WalletMovementWhereInput;
}

@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  async get(clientId: string): Promise<Wallet> {
    const row = await this.prisma.wallet.findUnique({ where: { clientId } });
    if (!row) throw new NotFoundException(MESSAGES.profilePending);
    return toWallet(row);
  }

  async topUp(clientId: string, key: string, request: TopUpRequest): Promise<Wallet> {
    await this.apply(clientId, key, {
      kind: 'TOP_UP',
      amount: request.amount,
      occurredOn: request.paidOn,
      reference: null,
      description: MESSAGES.topUpDescription,
    });
    return this.get(clientId);
  }

  // ventas pays a ticket (or a rental) with Idempotency-Key = the id of what it pays.
  async debit(key: string, request: WalletDebitRequest): Promise<WalletDebit> {
    if (key !== request.reference) throw new BadRequestException(SERVER_MESSAGES.invalidData);
    return this.apply(request.clientId, key, {
      kind: request.kind,
      amount: request.amount,
      occurredOn: request.occurredOn,
      reference: request.reference,
      description: request.description,
    });
  }

  async movements(clientId: string, query: WalletMovementListQuery): Promise<WalletMovementPage> {
    const where = movementFilter(clientId, query);
    const [rows, total] = await Promise.all([
      this.prisma.walletMovement.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...pageArgs(query),
      }),
      this.prisma.walletMovement.count({ where }),
    ]);
    return toPage(rows.map(toMovement), total, query);
  }

  private async apply(
    clientId: string,
    key: string,
    intent: MovementIntent & { description: string },
  ): Promise<Applied> {
    const fingerprint = movementFingerprint(intent);
    try {
      return await this.prisma.$transaction((tx) =>
        this.applyIn(tx, clientId, key, intent, fingerprint),
      );
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // Another request with the same key committed first: answer with what it recorded.
      const first = await this.prisma.walletMovement.findUnique({
        where: { clientId_idempotencyKey: { clientId, idempotencyKey: key } },
      });
      if (!first) throw error;
      return replayed(first, fingerprint);
    }
  }

  private async applyIn(
    tx: Prisma.TransactionClient,
    clientId: string,
    key: string,
    intent: MovementIntent & { description: string },
    fingerprint: string,
  ): Promise<Applied> {
    const existing = await tx.walletMovement.findUnique({
      where: { clientId_idempotencyKey: { clientId, idempotencyKey: key } },
    });
    if (existing) return replayed(existing, fingerprint);

    const amount = signedAmount(intent.kind, intent.amount);
    // The update locks the wallet row, so concurrent debits are applied one after the other and
    // the balance check sees the latest balance.
    const updated = await tx.wallet.updateMany({
      where: { clientId, ...(amount < 0 && { balance: { gte: intent.amount } }) },
      data: { balance: { increment: amount }, updatedAt: new Date() },
    });
    if (updated.count === 0) throw await this.notApplied(tx, clientId);

    const { balance } = await tx.wallet.findUniqueOrThrow({ where: { clientId } });
    const movement = await tx.walletMovement.create({
      data: {
        id: randomUUID(),
        clientId,
        kind: intent.kind,
        amount,
        balanceAfter: balance,
        reference: intent.reference,
        description: intent.description,
        occurredOn: day(intent.occurredOn),
        idempotencyKey: key,
        fingerprint,
      },
    });
    return { movementId: movement.id, balance: balance.toNumber() };
  }

  private async notApplied(tx: Prisma.TransactionClient, clientId: string): Promise<Error> {
    const wallet = await tx.wallet.findUnique({ where: { clientId } });
    return wallet
      ? new UnprocessableEntityException(MESSAGES.insufficientBalance)
      : new NotFoundException(MESSAGES.profilePending);
  }
}
