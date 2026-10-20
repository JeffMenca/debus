import type { PrismaService } from '../../src/prisma/prisma.service';

const SOLD = `
  SELECT envelope->'payload' AS payload FROM outbox
  WHERE type = 'TicketSold' AND envelope->'payload'->>'ticketId' = $1`;
const FORGET_SOLD = `
  DELETE FROM outbox
  WHERE type = 'TicketSold' AND envelope->'payload'->>'ticketId' = ANY($1::text[])`;

// The TicketSold events a test queued, read by ticket and removed at the end.
export function soldEvents(prisma: PrismaService) {
  const tickets: string[] = [];
  return {
    async of(ticketId: string): Promise<Record<string, unknown>[]> {
      tickets.push(ticketId);
      const rows = await prisma.$queryRawUnsafe<{ payload: Record<string, unknown> }[]>(
        SOLD,
        ticketId,
      );
      return rows.map((row) => row.payload);
    },
    track(ticketId: string): void {
      tickets.push(ticketId);
    },
    async cleanUp(): Promise<void> {
      await prisma.$executeRawUnsafe(FORGET_SOLD, tickets);
    },
  };
}
