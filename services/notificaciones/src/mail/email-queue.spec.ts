import { EmailQueue, type QueuedEmail } from './email-queue';
import { MAX_EMAIL_ATTEMPTS } from './email-rules';

const message = { to: 'ana@correo.com', subject: 'Hola', html: '<p>Hola</p>', text: 'Hola' };
const email: QueuedEmail = {
  eventId: 'e-1',
  dedupeKey: 'ticket-sold:t-1',
  template: 'TICKET_SOLD',
  message,
};
const claimed = (attempts = 0, id = 'm-1') => ({ id, recipient: message.to, ...message, attempts });

function setup() {
  const mailer = { send: jest.fn().mockResolvedValue(undefined) };
  const prisma = {
    sentEmail: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    $queryRaw: jest.fn().mockResolvedValue([]),
    $executeRaw: jest.fn().mockResolvedValue(1),
  };
  const tx = { $executeRaw: jest.fn().mockResolvedValue(1), sentEmail: { updateMany: jest.fn() } };
  const queue = new EmailQueue(mailer, prisma as never);
  return { mailer, prisma, tx, queue };
}

describe('EmailQueue', () => {
  it('queues each email once per business key and recipient, in the inbox transaction', async () => {
    const { prisma, tx, queue } = setup();
    const sendAfter = new Date('2026-10-21T14:00:00.000Z');

    expect(await queue.enqueue(tx as never, [email, { ...email, sendAfter }])).toBe(2);

    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
    const [sql, ...values] = tx.$executeRaw.mock.calls[0];
    expect(sql.join('?')).toContain('ON CONFLICT (dedupe_key, recipient) DO UPDATE');
    // Only a cancelled alert comes back (a reactivated driver, a date set back): a sent one never.
    expect(sql.join('?')).toContain("WHERE sent_emails.status = 'CANCELLED'");
    expect(values).toEqual(
      expect.arrayContaining(['e-1', 'ticket-sold:t-1', 'ana@correo.com', 'TICKET_SOLD', 'Hola']),
    );
    expect(tx.$executeRaw.mock.calls[1]).toContain(sendAfter);
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('writes nothing for an empty list and uses Prisma without a transaction', async () => {
    const { prisma, queue } = setup();

    expect(await queue.enqueue(undefined, [])).toBe(0);
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
    expect(await queue.enqueue(undefined, [email])).toBe(1);
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('cancels only the pending emails whose key starts with the prefix', async () => {
    const { tx, queue } = setup();

    await queue.cancelPending(tx as never, 'license:d-1:');

    expect(tx.sentEmail.updateMany).toHaveBeenCalledWith({
      where: { dedupeKey: { startsWith: 'license:d-1:' }, status: 'PENDING' },
      data: { status: 'CANCELLED', claimedUntil: null },
    });
  });

  it('sends the claimed emails and marks them sent', async () => {
    const { mailer, prisma, queue } = setup();
    prisma.$queryRaw.mockResolvedValue([claimed()]);

    expect(await queue.flush()).toEqual({ sent: 1, failed: 0 });

    expect(mailer.send).toHaveBeenCalledWith(message);
    // Only while still pending: one cancelled meanwhile stays cancelled.
    expect(prisma.sentEmail.updateMany).toHaveBeenCalledWith({
      where: { id: 'm-1', status: 'PENDING' },
      data: { status: 'SENT', sentAt: expect.any(Date), claimedUntil: null, lastError: null },
    });
  });

  it('keeps a failed email for a later retry, and one failure does not stop the others', async () => {
    const { mailer, prisma, queue } = setup();
    prisma.$queryRaw.mockResolvedValue([claimed(0, 'm-1'), claimed(2, 'm-2')]);
    mailer.send.mockRejectedValueOnce(new Error('smtp down'));

    expect(await queue.flush()).toEqual({ sent: 1, failed: 1 });

    expect(prisma.sentEmail.updateMany).toHaveBeenCalledWith({
      where: { id: 'm-1', status: 'PENDING' },
      data: {
        attempts: 1,
        lastError: 'smtp down',
        claimedUntil: null,
        sendAfter: expect.any(Date),
        status: 'PENDING',
      },
    });
    const retryAt = prisma.sentEmail.updateMany.mock.calls[0][0].data.sendAfter as Date;
    expect(retryAt.getTime()).toBeGreaterThan(Date.now() + 50_000);
    expect(prisma.sentEmail.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'm-2', status: 'PENDING' },
        data: expect.objectContaining({ status: 'SENT' }),
      }),
    );
  });

  it('gives up after the last attempt', async () => {
    const { mailer, prisma, queue } = setup();
    prisma.$queryRaw.mockResolvedValue([claimed(MAX_EMAIL_ATTEMPTS - 1)]);
    mailer.send.mockRejectedValue('x'.repeat(900));

    await queue.flush();

    const data = prisma.sentEmail.updateMany.mock.calls[0][0].data;
    expect(data).toMatchObject({ attempts: MAX_EMAIL_ATTEMPTS, status: 'FAILED' });
    expect(data.lastError).toHaveLength(500);
  });

  it('keeps going with the batch when recording one email fails', async () => {
    const { mailer, prisma, queue } = setup();
    prisma.$queryRaw.mockResolvedValue([claimed(0, 'm-1'), claimed(0, 'm-2')]);
    prisma.sentEmail.updateMany.mockRejectedValueOnce(new Error('connection lost'));

    expect(await queue.flush()).toEqual({ sent: 1, failed: 1 });
    expect(mailer.send).toHaveBeenCalledTimes(2);
  });
});
