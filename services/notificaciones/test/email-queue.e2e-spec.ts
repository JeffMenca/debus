import { testEmail } from '@debus/config/test-data';
import { createSmtpMailer } from '../src/mail/create-smtp-mailer';
import { EmailQueue, type QueuedEmail } from '../src/mail/email-queue';
import { loadMailSettings } from '../src/mail/mail-settings';
import type { Mailer, MailMessage } from '../src/mail/mailer';
import type { PrismaService } from '../src/prisma/prisma.service';
import { findMail } from './mailpit';
import { type IsolatedSchema, isolatedSchema } from './support/isolated-schema';

// The queue is flushed as a whole, so it runs on a schema of its own: the shared one may hold the
// pending emails of the local stack.
let isolated: IsolatedSchema;
let smtp: Mailer;

const queued = (to: string, key = `ticket-sold:${to}`): QueuedEmail => ({
  eventId: `event-${to}`,
  dedupeKey: key,
  template: 'TICKET_SOLD',
  message: { to, subject: 'Tu boleto', html: '<p>Listo</p>', text: 'Listo' },
});

const queueWith = (mailer: Mailer) =>
  new EmailQueue(mailer, isolated.client as unknown as PrismaService);
const rowsOf = (recipient: string) =>
  isolated.client.sentEmail.findMany({ where: { recipient }, orderBy: { createdAt: 'asc' } });

beforeAll(async () => {
  isolated = await isolatedSchema('email_queue');
  smtp = createSmtpMailer(loadMailSettings(process.env));
});

afterAll(async () => {
  await isolated.drop();
});

beforeEach(async () => {
  await isolated.client.sentEmail.deleteMany();
});

describe('email queue', () => {
  it('sends an email queued twice under the same key only once', async () => {
    const to = testEmail('queue-once');
    const queue = queueWith(smtp);

    expect(await queue.enqueue(undefined, [queued(to)])).toBe(1);
    expect(await queue.enqueue(undefined, [{ ...queued(to), eventId: 'republished' }])).toBe(0);

    expect(await queue.flush()).toEqual({ sent: 1, failed: 0 });
    expect(await queue.flush()).toEqual({ sent: 0, failed: 0 });
    expect(await findMail(to)).toHaveLength(1);
    expect(await rowsOf(to)).toEqual([
      expect.objectContaining({ status: 'SENT', attempts: 0, sentAt: expect.any(Date) }),
    ]);
  });

  it('retries a failed email later and sends it then', async () => {
    const to = testEmail('queue-retry');
    const failing = { send: jest.fn().mockRejectedValue(new Error('smtp down')) };
    await queueWith(failing).enqueue(undefined, [queued(to)]);

    expect(await queueWith(failing).flush()).toEqual({ sent: 0, failed: 1 });
    const [waiting] = await rowsOf(to);
    expect(waiting).toMatchObject({ status: 'PENDING', attempts: 1, lastError: 'smtp down' });
    expect(waiting!.sendAfter.getTime()).toBeGreaterThan(Date.now());

    // Not due yet: nothing goes out.
    expect(await queueWith(smtp).flush()).toEqual({ sent: 0, failed: 0 });
    await isolated.client.sentEmail.updateMany({ data: { sendAfter: new Date(Date.now() - 1) } });
    expect(await queueWith(smtp).flush()).toEqual({ sent: 1, failed: 0 });
    expect(await findMail(to)).toHaveLength(1);
  });

  it('never gives the same email to two flushes running at once', async () => {
    const recipients = [1, 2, 3].map((n) => testEmail(`queue-race-${n}`));
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const sentBySlow: string[] = [];
    // The first flush claims every row and holds them until the second one has finished.
    const slow: Mailer = {
      send: async (message: MailMessage) => {
        await held;
        sentBySlow.push(message.to);
      },
    };
    const fast = { send: jest.fn().mockResolvedValue(undefined) };
    await queueWith(smtp).enqueue(
      undefined,
      recipients.map((to) => queued(to)),
    );

    const first = queueWith(slow).flush();
    await waitFor(async () => (await claimedCount()) === recipients.length);
    expect(await queueWith(fast).flush()).toEqual({ sent: 0, failed: 0 });
    release();

    expect(await first).toEqual({ sent: 3, failed: 0 });
    expect(fast.send).not.toHaveBeenCalled();
    expect(sentBySlow.sort()).toEqual([...recipients].sort());
  });

  it('takes back the emails of a flush that died when its lease expires', async () => {
    const to = testEmail('queue-lease');
    await queueWith(smtp).enqueue(undefined, [queued(to)]);
    await isolated.client.sentEmail.updateMany({
      data: { claimedUntil: new Date(Date.now() - 1_000) },
    });

    expect(await queueWith(smtp).flush()).toEqual({ sent: 1, failed: 0 });
  });

  it('never sends a cancelled email', async () => {
    const to = testEmail('queue-cancel');
    const queue = queueWith(smtp);
    await queue.enqueue(undefined, [queued(to, 'license:d-1:2026-11-01:30')]);

    await queue.cancelPending(undefined, 'license:d-1:');

    expect(await queue.flush()).toEqual({ sent: 0, failed: 0 });
    expect(await rowsOf(to)).toEqual([expect.objectContaining({ status: 'CANCELLED' })]);
  });

  it('queues a cancelled email again, but never one already sent', async () => {
    const to = testEmail('queue-revive');
    const queue = queueWith(smtp);
    const alert = queued(to, 'license:d-2:2026-11-01:30');
    await queue.enqueue(undefined, [alert]);
    await queue.cancelPending(undefined, 'license:d-2:');

    expect(await queue.enqueue(undefined, [alert])).toBe(1);
    expect(await queue.flush()).toEqual({ sent: 1, failed: 0 });
    expect(await queue.enqueue(undefined, [alert])).toBe(0);
    expect(await queue.flush()).toEqual({ sent: 0, failed: 0 });
    expect(await findMail(to)).toHaveLength(1);
  });

  it('leaves cancelled an email that was cancelled while a flush was sending it', async () => {
    const to = testEmail('queue-cancel-race');
    const cancelling: Mailer = {
      send: async () => {
        await queueWith(smtp).cancelPending(undefined, 'license:d-3:');
      },
    };
    await queueWith(smtp).enqueue(undefined, [queued(to, 'license:d-3:2026-11-01:30')]);

    await queueWith(cancelling).flush();

    expect(await rowsOf(to)).toEqual([expect.objectContaining({ status: 'CANCELLED' })]);
  });

  it('refuses a queued email without its content', async () => {
    await expect(
      isolated.client.$executeRawUnsafe(
        `INSERT INTO sent_emails (id, event_id, dedupe_key, recipient, template, status)
         VALUES (gen_random_uuid(), 'e', 'k', 'x@debus.test', 'T', 'PENDING')`,
      ),
    ).rejects.toThrow(/sent_emails_pending_has_content/);
  });
});

async function claimedCount(): Promise<number> {
  return isolated.client.sentEmail.count({ where: { claimedUntil: { not: null } } });
}

async function waitFor(check: () => Promise<boolean>): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('the condition never held');
}
