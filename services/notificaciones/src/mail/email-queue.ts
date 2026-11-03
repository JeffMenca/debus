import type { SqlClient } from '@debus/messaging';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { inTransaction } from '../prisma/transaction';
import { isExhausted, retryDelayMs } from './email-rules';
import { Mailer, type MailMessage } from './mailer';

export interface QueuedEmail {
  eventId: string;
  // What the email is about (`ticket-sold:<ticketId>`): with the recipient, it is sent only once.
  dedupeKey: string;
  template: string;
  message: MailMessage;
  sendAfter?: Date;
}

export interface EmailFlushResult {
  sent: number;
  failed: number;
}

interface ClaimedEmail {
  id: string;
  recipient: string;
  subject: string;
  html: string;
  text: string;
  attempts: number;
}

const BATCH = 20;
// Covers a whole batch of sends at their 25 s deadline: a live flush never loses its rows to another.
const LEASE = '15 minutes';
const ERROR_LENGTH = 500;

const errorText = (error: unknown): string =>
  (error instanceof Error ? error.message : String(error)).slice(0, ERROR_LENGTH);

@Injectable()
export class EmailQueue {
  private readonly logger = new Logger(EmailQueue.name);

  constructor(
    private readonly mailer: Mailer,
    private readonly prisma: PrismaService,
  ) {}

  // A row already sent or pending stays as it is; a cancelled one is queued again with the new
  // content (a driver reactivated, a date set back to the previous one).
  async enqueue(tx: SqlClient | undefined, emails: readonly QueuedEmail[]): Promise<number> {
    const db = inTransaction(tx, this.prisma);
    let queued = 0;
    for (const { eventId, dedupeKey, template, message, sendAfter } of emails) {
      queued += await db.$executeRaw`
        INSERT INTO sent_emails (id, event_id, dedupe_key, recipient, template, subject, html, text,
          status, send_after)
        VALUES (gen_random_uuid(), ${eventId}, ${dedupeKey}, ${message.to}, ${template},
          ${message.subject}, ${message.html}, ${message.text}, 'PENDING',
          COALESCE(${sendAfter ?? null}::timestamptz, now()))
        ON CONFLICT (dedupe_key, recipient) DO UPDATE SET event_id = EXCLUDED.event_id,
          subject = EXCLUDED.subject, html = EXCLUDED.html, text = EXCLUDED.text,
          status = 'PENDING', send_after = EXCLUDED.send_after, attempts = 0, last_error = NULL,
          claimed_until = NULL
        WHERE sent_emails.status = 'CANCELLED'`;
    }
    return queued;
  }

  async cancelPending(tx: SqlClient | undefined, keyPrefix: string): Promise<void> {
    await inTransaction(tx, this.prisma).sentEmail.updateMany({
      where: { dedupeKey: { startsWith: keyPrefix }, status: 'PENDING' },
      data: { status: 'CANCELLED', claimedUntil: null },
    });
  }

  // Rows claimed by a concurrent flush are skipped; a lease that expires frees the rows of a dead one.
  async flush(limit = BATCH): Promise<EmailFlushResult> {
    const claimed = await this.prisma.$queryRaw<ClaimedEmail[]>`
      UPDATE sent_emails SET claimed_until = now() + ${LEASE}::interval
      WHERE id IN (
        SELECT id FROM sent_emails
        WHERE status = 'PENDING' AND send_after <= now()
          AND (claimed_until IS NULL OR claimed_until < now())
        ORDER BY send_after, id LIMIT ${limit}
        FOR UPDATE SKIP LOCKED)
      RETURNING id, recipient, subject, html, text, attempts`;
    const result: EmailFlushResult = { sent: 0, failed: 0 };
    for (const email of claimed) {
      if (await this.deliver(email).catch((error: unknown) => this.unrecorded(email, error))) {
        result.sent += 1;
      } else {
        result.failed += 1;
      }
    }
    return result;
  }

  private async deliver(email: ClaimedEmail): Promise<boolean> {
    try {
      await this.mailer.send({
        to: email.recipient,
        subject: email.subject,
        html: email.html,
        text: email.text,
      });
    } catch (error) {
      await this.retryLater(email, errorText(error));
      return false;
    }
    await this.prisma.sentEmail.updateMany({
      where: { id: email.id, status: 'PENDING' },
      data: { status: 'SENT', sentAt: new Date(), claimedUntil: null, lastError: null },
    });
    return true;
  }

  // The row keeps its lease and is taken again when it expires; the rest of the batch goes on.
  private unrecorded(email: ClaimedEmail, error: unknown): false {
    this.logger.error(`Email ${email.id} could not be recorded: ${errorText(error)}`);
    return false;
  }

  private async retryLater(email: ClaimedEmail, lastError: string): Promise<void> {
    const attempts = email.attempts + 1;
    const exhausted = isExhausted(attempts);
    if (exhausted) this.logger.error(`Email ${email.id} failed ${attempts} times: ${lastError}`);
    await this.prisma.sentEmail.updateMany({
      where: { id: email.id, status: 'PENDING' },
      data: {
        attempts,
        lastError,
        claimedUntil: null,
        sendAfter: new Date(Date.now() + retryDelayMs(attempts)),
        status: exhausted ? 'FAILED' : 'PENDING',
      },
    });
  }
}
