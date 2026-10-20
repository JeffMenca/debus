import { ImapFlow } from 'imapflow';
import { extractLink, htmlOf } from './mime';
import { sleep } from './retry';

export interface Mailbox {
  // The path and query of the newest link that matches `pathPattern` in an email sent to `to` since `since`.
  latestLink(to: string, pathPattern: string, since: Date): Promise<string>;
}

interface Polling {
  timeoutMs?: number;
  pollMs?: number;
}

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_POLL_MS = 500;
// The clocks of the mail server and of this machine may differ a little.
const CLOCK_SKEW_MS = 5_000;

const missing = (to: string, pathPattern: string): Error =>
  new Error(`No email with a link to ${pathPattern} reached ${to}`);

async function poll(
  { timeoutMs = DEFAULT_TIMEOUT_MS, pollMs = DEFAULT_POLL_MS }: Polling,
  attempt: () => Promise<string | null>,
  onTimeout: () => Error,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  do {
    const found = await attempt();
    if (found) return found;
    await sleep(pollMs);
  } while (Date.now() < deadline);
  throw onTimeout();
}

const isFresh = (at: Date, since: Date): boolean => at.getTime() >= since.getTime() - CLOCK_SKEW_MS;

// Local stack: Mailpit keeps every email the services send.
export class MailpitMailbox implements Mailbox {
  private readonly baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly polling: Polling = {},
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  latestLink(to: string, pathPattern: string, since: Date): Promise<string> {
    return poll(
      this.polling,
      () => this.find(to, pathPattern, since),
      () => missing(to, pathPattern),
    );
  }

  private async find(to: string, pathPattern: string, since: Date): Promise<string | null> {
    const query = encodeURIComponent(`to:${to}`);
    const search = await this.fetchImpl(`${this.baseUrl}/api/v1/search?query=${query}`);
    const { messages } = (await search.json()) as { messages: { ID: string; Created: string }[] };
    for (const { ID, Created } of messages) {
      if (!isFresh(new Date(Created), since)) continue;
      const message = await this.fetchImpl(`${this.baseUrl}/api/v1/message/${ID}`);
      const { HTML } = (await message.json()) as { HTML: string };
      const link = extractLink(HTML, pathPattern);
      if (link) return link;
    }
    return null;
  }
}

// The part of ImapFlow the seed uses, so tests do not need a server.
export interface ImapClientLike {
  connect(): Promise<void>;
  logout(): Promise<void>;
  getMailboxLock(path: string): Promise<{ release(): void }>;
  search(query: { to: string; since: Date }): Promise<number[] | false | undefined>;
  fetchOne(
    seq: string,
    query: { source: true; internalDate: true },
  ): Promise<{ source?: Buffer; internalDate?: Date | string } | false | undefined>;
}

export interface ImapOptions {
  host: string;
  user: string;
  password: string;
}

const connect = ({ host, user, password }: ImapOptions): ImapClientLike =>
  new ImapFlow({ host, port: 993, secure: true, auth: { user, pass: password }, logger: false });

// Production: the team inbox that receives every tagged address.
export class ImapMailbox implements Mailbox {
  private readonly createClient: (options: ImapOptions) => ImapClientLike;
  private readonly polling: Polling;

  constructor(
    private readonly options: ImapOptions,
    extras: { createClient?: (options: ImapOptions) => ImapClientLike } & Polling = {},
  ) {
    const { createClient = connect, ...polling } = extras;
    this.createClient = createClient;
    this.polling = polling;
  }

  async latestLink(to: string, pathPattern: string, since: Date): Promise<string> {
    const client = this.createClient(this.options);
    try {
      await client.connect();
      return await poll(
        this.polling,
        () => this.find(client, to, pathPattern, since),
        () => missing(to, pathPattern),
      );
    } finally {
      await client.logout().catch(() => undefined);
    }
  }

  private async find(
    client: ImapClientLike,
    to: string,
    pathPattern: string,
    since: Date,
  ): Promise<string | null> {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const found = (await client.search({ to, since })) || [];
      for (const seq of [...found].sort((a, b) => b - a)) {
        const message = await client.fetchOne(String(seq), { source: true, internalDate: true });
        if (!message || !message.source || !message.internalDate) continue;
        if (!isFresh(new Date(message.internalDate), since)) continue;
        const link = extractLink(htmlOf(message.source.toString('utf8')), pathPattern);
        if (link) return link;
      }
      return null;
    } finally {
      lock.release();
    }
  }
}
