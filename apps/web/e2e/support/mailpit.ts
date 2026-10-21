import { isLocalStack } from './local-stack';

const LOCAL_MAILPIT = 'http://localhost:8025';
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Mailpit only exists next to a local stack; against a deployed web it must be given explicitly.
export function mailpitUrl(baseURL: string | undefined): string | undefined {
  if (process.env.MAILPIT_URL) return process.env.MAILPIT_URL;
  return isLocalStack(baseURL) ? LOCAL_MAILPIT : undefined;
}

export async function isReachable(mailpit: string): Promise<boolean> {
  try {
    return (await fetch(`${mailpit}/api/v1/info`)).ok;
  } catch {
    return false;
  }
}

export interface MailpitMessage {
  ID: string;
  Subject: string;
}

// Newest first, as Mailpit lists them.
async function messagesTo(mailpit: string, to: string): Promise<MailpitMessage[]> {
  const search = await fetch(`${mailpit}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`);
  return ((await search.json()) as { messages: MailpitMessage[] }).messages;
}

// Pub/Sub may redeliver a push after its backoff (10 s minimum), so the wait covers a few retries.
const EMAIL_WAIT_MS = 60_000;

// Returns the path and query only: the email points at the configured public address,
// which is not where the test web server listens.
export async function latestLink(mailpit: string, to: string, path: string): Promise<string> {
  const deadline = Date.now() + EMAIL_WAIT_MS;
  while (Date.now() < deadline) {
    const [latest] = await messagesTo(mailpit, to);
    if (latest) {
      const message = await fetch(`${mailpit}/api/v1/message/${latest.ID}`);
      const { HTML } = (await message.json()) as { HTML: string };
      const match = new RegExp(`href="([^"]*${path}\\?token=[^"]+)"`).exec(HTML);
      if (match?.[1]) {
        const link = new URL(match[1].replace(/&amp;/g, '&'));
        return `${link.pathname}${link.search}`;
      }
    }
    await sleep(500);
  }
  throw new Error(`No email with ${path} reached ${to}`);
}

const LOCAL_NOTIFICATIONS = 'http://localhost:4007';

// Waits for an email whose subject matches. notificaciones queues the emails and a job sends them
// every minute; the local stack runs no scheduler for the test, so each attempt flushes the queue.
export async function waitForMail(
  mailpit: string,
  to: string,
  subject: RegExp,
): Promise<MailpitMessage> {
  const deadline = Date.now() + EMAIL_WAIT_MS;
  while (Date.now() < deadline) {
    await flushEmails();
    const messages = await messagesTo(mailpit, to);
    const found = messages.find((message) => subject.test(message.Subject));
    if (found) return found;
    await sleep(1_000);
  }
  throw new Error(`No email "${subject}" reached ${to}`);
}

export async function mailSubjects(mailpit: string, to: string): Promise<string[]> {
  const messages = await messagesTo(mailpit, to);
  return messages.map((message) => message.Subject).sort();
}

export async function flushEmails(): Promise<void> {
  await fetch(`${LOCAL_NOTIFICATIONS}/internal/emails/flush`, { method: 'POST' }).catch(
    () => undefined,
  );
}

// The daily licence job, run by hand: the local stack has no scheduler.
export async function runLicenseAlerts(): Promise<void> {
  const response = await fetch(`${LOCAL_NOTIFICATIONS}/internal/license-alerts/run`, {
    method: 'POST',
  });
  if (!response.ok) throw new Error(`The licence job answered ${response.status}`);
}

export async function deleteMailOf(mailpit: string, query: string): Promise<void> {
  await fetch(`${mailpit}/api/v1/search?query=${encodeURIComponent(query)}`, { method: 'DELETE' });
}
