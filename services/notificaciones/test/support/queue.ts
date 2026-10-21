import type { INestApplication } from '@nestjs/common';
import { EmailQueue } from '../../src/mail/email-queue';

// What the scheduler does every minute: flush until nothing due is left, however many batches.
export async function drainQueue(app: INestApplication): Promise<void> {
  const queue = app.get(EmailQueue);
  for (let round = 0; round < 50; round++) {
    const { sent, failed } = await queue.flush();
    if (sent + failed === 0) return;
  }
  throw new Error('the email queue did not drain');
}
