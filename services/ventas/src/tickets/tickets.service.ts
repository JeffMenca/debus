import { type TicketListQuery, type TicketPage, pageArgs, toPage } from '@debus/contracts';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { historyWhere, nextTripWhere } from './ticket-history';
import { SOLD_TICKET_INCLUDE, toTicket } from './ticket-rules';

@Injectable()
export class TicketsService {
  constructor(private readonly prisma: PrismaService) {}

  async history(clientId: string, query: TicketListQuery): Promise<TicketPage> {
    const where = historyWhere(clientId, query);
    const [rows, total, next] = await Promise.all([
      this.prisma.ticket.findMany({
        where,
        include: SOLD_TICKET_INCLUDE,
        // The id breaks ties, so a ticket never shows up on two pages or on none.
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...pageArgs(query),
      }),
      this.prisma.ticket.count({ where }),
      this.prisma.ticket.findFirst({
        where: nextTripWhere(clientId, new Date()),
        include: SOLD_TICKET_INCLUDE,
        orderBy: [{ trip: { departureAt: 'asc' } }, { id: 'asc' }],
      }),
    ]);
    return {
      ...toPage(rows.map(toTicket), total, query),
      summary: { next: next && toTicket(next) },
    };
  }
}
