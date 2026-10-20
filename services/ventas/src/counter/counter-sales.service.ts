import type { CounterSaleRequest, Ticket } from '@debus/contracts';
import { Outbox, REQUEST_FLUSH } from '@debus/messaging';
import { type Identity, requireBranch } from '@debus/server';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { linkableNit } from '../clients/client-rules';
import { MESSAGES } from '../messages';
import { PrismaService } from '../prisma/prisma.service';
import { SeatReservationsService } from '../seats/seat-reservations.service';
import {
  SOLD_TICKET_INCLUDE,
  type SoldTicket,
  toTicket,
  toTicketSoldPayload,
} from '../tickets/ticket-rules';
import { buyerNameFor, sameSale } from './counter-rules';

// A ProfileUpdated that lands between the lookup of the NIT and the insert of the ticket finds no
// ticket to link; once the ticket exists, linking it again here closes that gap.
const LINK_SALE = `
  UPDATE tickets SET client_id = (
    SELECT client_id FROM client_nits
    WHERE client_nits.nit = tickets.nit ORDER BY updated_at DESC LIMIT 1)
  WHERE id = $1::uuid AND client_id IS NULL AND nit <> 'CF'
    AND EXISTS (SELECT 1 FROM client_nits WHERE client_nits.nit = tickets.nit)`;

@Injectable()
export class CounterSalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly seats: SeatReservationsService,
    private readonly outbox: Outbox,
  ) {}

  // A cash sale: the seats are held like any purchase and confirmed at once, since the money is
  // already at the counter. The key is the ticket id, so a retry never sells the seats twice.
  async sell(
    actor: Identity,
    ticketId: string,
    request: CounterSaleRequest,
    correlationId?: string,
  ): Promise<Ticket> {
    const branchId = requireBranch(actor);
    const existing = await this.load(ticketId);
    if (existing) return this.resume(existing, request, branchId, correlationId);

    const trip = await this.prisma.trip.findUnique({ where: { tripId: request.tripId } });
    if (!trip) throw new NotFoundException(MESSAGES.tripNotFound);
    if (trip.branchId !== branchId) throw new ForbiddenException(MESSAGES.otherBranch);
    const client = linkableNit(request.nit)
      ? await this.prisma.clientNit.findFirst({
          where: { nit: request.nit },
          orderBy: { updatedAt: 'desc' },
        })
      : null;

    try {
      await this.seats.reserve({
        ticketId,
        tripId: request.tripId,
        seats: request.seats,
        channel: 'COUNTER',
        clientId: client?.clientId ?? null,
        nit: request.nit,
        buyerName: buyerNameFor(request.buyerName, client),
        email: request.email ?? null,
        paidOn: request.paidOn,
      });
    } catch (error) {
      // Two requests with the same key at once: the one that lost finds the ticket of the other.
      const raced = error instanceof ConflictException ? await this.load(ticketId) : null;
      if (!raced) throw error;
      return this.resume(raced, request, branchId, correlationId);
    }
    return this.confirm(ticketId, correlationId);
  }

  private load(ticketId: string): Promise<SoldTicket | null> {
    return this.prisma.ticket.findUnique({ where: { id: ticketId }, include: SOLD_TICKET_INCLUDE });
  }

  private async resume(
    ticket: SoldTicket,
    request: CounterSaleRequest,
    branchId: string,
    correlationId?: string,
  ): Promise<Ticket> {
    if (!sameSale(ticket, request, branchId)) {
      throw new ConflictException(MESSAGES.saleKeyReused);
    }
    return ticket.status === 'PENDING' ? this.confirm(ticket.id, correlationId) : toTicket(ticket);
  }

  // Only the request that moves the ticket out of PENDING announces it.
  private async confirm(ticketId: string, correlationId?: string): Promise<Ticket> {
    const ticket = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.ticket.updateMany({
        where: { id: ticketId, status: 'PENDING' },
        data: { status: 'CONFIRMED' },
      });
      await tx.$executeRawUnsafe(LINK_SALE, ticketId);
      const sold = await tx.ticket.findUniqueOrThrow({
        where: { id: ticketId },
        include: SOLD_TICKET_INCLUDE,
      });
      if (count === 1) {
        await this.outbox.add(tx, 'TicketSold', toTicketSoldPayload(sold), correlationId);
      }
      return sold;
    });
    await this.outbox.flush(REQUEST_FLUSH);
    return toTicket(ticket);
  }
}
