import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PurchasesService } from './purchases.service';

const BATCH = 10;
// A purchase that is not settled after a minute is not being worked on by anyone.
const REST_MS = 60_000;
// A counter sale confirms in the same request, so a pending one lost its request half an hour ago.
const COUNTER_TIMEOUT_MS = 30 * 60_000;

export interface RecoveryResult {
  resumed: number;
  stillPending: number;
  releasedCounterTickets: number;
}

// What the scheduler runs every minute: settles the purchases that were left in doubt and frees the
// seats of counter sales that never finished.
@Injectable()
export class PurchaseRecoveryService {
  private readonly logger = new Logger(PurchaseRecoveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly purchases: PurchasesService,
  ) {}

  async recover(): Promise<RecoveryResult> {
    const now = Date.now();
    const due = await this.prisma.purchase.findMany({
      where: {
        status: 'PENDING',
        updatedAt: { lt: new Date(now - REST_MS) },
        OR: [{ lockedUntil: null }, { lockedUntil: { lt: new Date(now) } }],
      },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take: BATCH,
      select: { id: true },
    });

    let resumed = 0;
    let stillPending = 0;
    for (const { id } of due) {
      const state = await this.purchases.resume(id).catch((error: unknown) => {
        this.logger.warn({ ticketId: id, error }, 'Could not resume a purchase');
        return 'PENDING' as const;
      });
      if (state === 'PENDING') stillPending += 1;
      else resumed += 1;
    }

    const released = await this.prisma.ticket.deleteMany({
      where: {
        channel: 'COUNTER',
        status: 'PENDING',
        createdAt: { lt: new Date(now - COUNTER_TIMEOUT_MS) },
      },
    });
    return { resumed, stillPending, releasedCounterTickets: released.count };
  }
}
