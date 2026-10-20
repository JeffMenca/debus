import {
  CONSUMER_NIT,
  type Purchase,
  type PurchaseFailure,
  type PurchaseTicketRequest,
  WALLET_DEBIT_PATH,
  saleStatusSchema,
  walletDebitSchema,
} from '@debus/contracts';
import { Outbox, REQUEST_FLUSH } from '@debus/messaging';
import { type Identity, ServiceHttpClient, ServiceUnavailableError } from '@debus/server';
import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Purchase as PurchaseRow } from '../generated/prisma/client';
import { MESSAGES } from '../messages';
import { PrismaService } from '../prisma/prisma.service';
import { DuplicateTicketError, SeatReservationsService } from '../seats/seat-reservations.service';
import { SOLD_TICKET_INCLUDE, toTicketSoldPayload } from '../tickets/ticket-rules';
import {
  type DebitAnswer,
  debitOutcome,
  failureException,
  payByFor,
  purchaseDescription,
  samePurchase,
  saleStatusProblem,
  toPurchase,
} from './purchase-rules';

// Longer than the 3 s timeout of the call plus its confirmation, shorter than the minute that recovery waits.
const LEASE_MS = 30_000;

type Attempt =
  | { state: 'CONFIRMED' | 'PENDING' }
  | { state: 'FAILED'; failure: PurchaseFailure; peerMessage?: string };

const isoDay = (date: Date): string => date.toISOString().slice(0, 10);

// The saga of buying a ticket with the wallet, in three steps:
//   T1 (compensable)  hold the seats with a PENDING ticket and write the purchase record, in one batch.
//   T2 (pivot)        charge the wallet with Idempotency-Key = the ticket id. Once it may have been
//                     applied it cannot be undone from here, so it is only ever repeated with the same key.
//   T3 (retriable)    confirm the ticket and announce TicketSold, in one transaction.
// A refusal of the wallet compensates T1 (frees the seats); a payment in doubt keeps everything held and
// is settled by the next request with the same key, or by the recovery job.
@Injectable()
export class PurchasesService {
  private readonly logger = new Logger(PurchasesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly seats: SeatReservationsService,
    private readonly http: ServiceHttpClient,
    private readonly outbox: Outbox,
  ) {}

  async purchase(
    actor: Identity,
    ticketId: string,
    request: PurchaseTicketRequest,
    correlationId?: string,
  ): Promise<Purchase> {
    const existing = await this.prisma.purchase.findUnique({ where: { id: ticketId } });
    if (existing) return this.continueWith(existing, actor, request, correlationId);

    const client = await this.prisma.clientNit.findUnique({ where: { clientId: actor.userId } });
    if (!client) throw new ConflictException(MESSAGES.accountNotReady);
    if (this.http.isOpen('clientes')) {
      throw new ServiceUnavailableException(MESSAGES.walletUnavailable);
    }
    await this.checkTripOnSale(request.tripId, correlationId);

    try {
      await this.seats.reserve(
        {
          ticketId,
          tripId: request.tripId,
          seats: request.seats,
          channel: 'ONLINE',
          clientId: actor.userId,
          nit: client.nit ?? CONSUMER_NIT,
          buyerName: client.fullName,
          email: null,
          paidOn: request.paidOn,
        },
        (reserved) => [
          this.prisma.purchase.create({
            data: {
              id: ticketId,
              clientId: actor.userId,
              tripId: request.tripId,
              seats: [...request.seats].sort((a, b) => a - b),
              amount: reserved.total,
              description: purchaseDescription(
                reserved.originLabel,
                reserved.destinationLabel,
                request.seats,
              ),
              paidOn: new Date(`${request.paidOn}T00:00:00.000Z`),
              payBy: payByFor(new Date(), reserved.departureAt),
              status: 'PENDING',
            },
          }),
        ],
      );
    } catch (error) {
      // Two requests with the same key at once: the one that lost finds the purchase of the other.
      const raced =
        error instanceof DuplicateTicketError
          ? await this.prisma.purchase.findUnique({ where: { id: ticketId } })
          : null;
      if (!raced) throw error;
      return this.continueWith(raced, actor, request, correlationId);
    }
    return this.settle(ticketId, correlationId);
  }

  async get(actor: Identity, ticketId: string): Promise<Purchase> {
    const row = await this.prisma.purchase.findUnique({ where: { id: ticketId } });
    // Someone else's purchase answers like one that does not exist.
    if (!row || row.clientId !== actor.userId)
      throw new NotFoundException(MESSAGES.purchaseNotFound);
    return this.view(row);
  }

  // One more attempt to settle a pending purchase; also what the recovery job runs for each one.
  async resume(ticketId: string, correlationId?: string): Promise<Attempt['state']> {
    return (await this.attempt(ticketId, correlationId)).state;
  }

  private async continueWith(
    existing: PurchaseRow,
    actor: Identity,
    request: PurchaseTicketRequest,
    correlationId?: string,
  ): Promise<Purchase> {
    if (!samePurchase(existing, request, actor.userId)) {
      throw new ConflictException(MESSAGES.purchaseKeyReused);
    }
    if (existing.status === 'FAILED' && existing.failure) throw failureException(existing.failure);
    if (existing.status === 'CONFIRMED') return this.view(existing);
    return this.settle(existing.id, correlationId);
  }

  private async settle(ticketId: string, correlationId?: string): Promise<Purchase> {
    const result = await this.attempt(ticketId, correlationId);
    if (result.state === 'FAILED') throw failureException(result.failure, result.peerMessage);
    return this.view(await this.prisma.purchase.findUniqueOrThrow({ where: { id: ticketId } }));
  }

  // The sale is closed at the scheduled departure, or when the trip was removed; ventas only has a copy.
  private async checkTripOnSale(tripId: string, correlationId?: string): Promise<void> {
    const status = await this.http
      .get('viajes', `/internal/trips/${tripId}/sale-status`, saleStatusSchema, { correlationId })
      .catch((error: unknown) => {
        if (error instanceof ServiceUnavailableError) {
          throw new ServiceUnavailableException(MESSAGES.tripCheckUnavailable);
        }
        throw error;
      });
    const problem = saleStatusProblem(status);
    if (problem) throw problem;
  }

  // T2. The lease keeps the request of the person, its retry and the recovery job from charging at the same time.
  private async attempt(ticketId: string, correlationId?: string): Promise<Attempt> {
    const claimed = await this.prisma.purchase.updateMany({
      where: {
        id: ticketId,
        status: 'PENDING',
        OR: [{ lockedUntil: null }, { lockedUntil: { lt: new Date() } }],
      },
      data: { lockedUntil: new Date(Date.now() + LEASE_MS), debitAttempts: { increment: 1 } },
    });
    const row = await this.prisma.purchase.findUniqueOrThrow({ where: { id: ticketId } });
    if (claimed.count === 0 || row.status !== 'PENDING') return this.stateOf(row);

    // The claim counted this attempt: what had already left is the count before it.
    const sentBefore = row.debitAttempts - 1;
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { id: true },
    });
    if (!ticket) return this.ticketGone(row, sentBefore);

    const answer: DebitAnswer = await this.http
      .post(
        'clientes',
        WALLET_DEBIT_PATH,
        {
          clientId: row.clientId,
          amount: row.amount.toNumber(),
          kind: 'TICKET',
          reference: row.id,
          description: row.description,
          occurredOn: isoDay(row.paidOn),
          payBy: row.payBy.toISOString(),
        },
        walletDebitSchema,
        { correlationId, idempotencyKey: row.id },
      )
      .then((debit) => ({ debit }))
      .catch((error: unknown) => ({ error }));
    const outcome = debitOutcome(answer, sentBefore, row.payBy, new Date());

    if (outcome.kind === 'PAID') return this.confirm(row.id, outcome.email, correlationId);
    if (outcome.kind === 'REJECTED') {
      if (outcome.unexpected)
        this.logger.error(
          { ticketId, failure: outcome.failure },
          'Wallet refused a debit it should accept',
        );
      await this.compensate(row.id, outcome.failure);
      return { state: 'FAILED', failure: outcome.failure, peerMessage: outcome.peerMessage };
    }
    if (outcome.unexpected) this.logger.error({ ticketId }, outcome.reason);
    await this.release(row.id, outcome.reason);
    return { state: 'PENDING' };
  }

  // Seats are never freed while the money may have moved, and nothing is charged for seats that are gone.
  private async ticketGone(row: PurchaseRow, sentBefore: number): Promise<Attempt> {
    if (sentBefore === 0) {
      await this.compensate(row.id, 'TRIP_CANCELLED');
      return { state: 'FAILED', failure: 'TRIP_CANCELLED' };
    }
    const reason = 'The ticket is gone and a debit may already have been applied';
    this.logger.error({ ticketId: row.id }, reason);
    await this.release(row.id, reason);
    return { state: 'PENDING' };
  }

  // T3. Only the request that moves the purchase out of PENDING announces the sale.
  private async confirm(ticketId: string, email: string, correlationId?: string): Promise<Attempt> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const { count } = await tx.purchase.updateMany({
          where: { id: ticketId, status: 'PENDING' },
          data: { status: 'CONFIRMED', lockedUntil: null, lastError: null },
        });
        await tx.ticket.update({ where: { id: ticketId }, data: { status: 'CONFIRMED', email } });
        const sold = await tx.ticket.findUniqueOrThrow({
          where: { id: ticketId },
          include: SOLD_TICKET_INCLUDE,
        });
        if (count === 1) {
          await this.outbox.add(tx, 'TicketSold', toTicketSoldPayload(sold), correlationId);
        }
      });
    } catch (error) {
      // The wallet already answered: the lease expires and the same key brings the same answer again.
      this.logger.error({ ticketId, error }, 'Could not confirm a paid purchase');
      return { state: 'PENDING' };
    }
    await this.outbox.flush(REQUEST_FLUSH);
    return { state: 'CONFIRMED' };
  }

  // C1. The ticket goes with its seats; the purchase record stays, marked with why it failed.
  private compensate(ticketId: string, failure: PurchaseFailure): Promise<unknown> {
    return this.prisma.$transaction([
      this.prisma.ticket.deleteMany({ where: { id: ticketId, status: 'PENDING' } }),
      this.prisma.purchase.updateMany({
        where: { id: ticketId, status: 'PENDING' },
        data: { status: 'FAILED', failure, lockedUntil: null, lastError: null },
      }),
    ]);
  }

  private release(ticketId: string, reason: string): Promise<unknown> {
    return this.prisma.purchase.updateMany({
      where: { id: ticketId, status: 'PENDING' },
      data: { lockedUntil: null, lastError: reason },
    });
  }

  private stateOf(row: PurchaseRow): Attempt {
    return row.status === 'FAILED' && row.failure
      ? { state: 'FAILED', failure: row.failure }
      : { state: row.status === 'CONFIRMED' ? 'CONFIRMED' : 'PENDING' };
  }

  private async view(row: PurchaseRow): Promise<Purchase> {
    const ticket =
      row.status === 'CONFIRMED'
        ? await this.prisma.ticket.findUnique({
            where: { id: row.id },
            include: SOLD_TICKET_INCLUDE,
          })
        : null;
    return toPurchase(row, ticket);
  }
}
