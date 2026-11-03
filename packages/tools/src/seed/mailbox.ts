import { ImapFlow } from 'imapflow';
import { extractLink, htmlOf } from './mime';
import { sleep } from './retry';

export interface Mailbox {
  // The path and query of the newest link that matches `pathPattern` in an email sent to `to` since `since`.
  latestLink(to: string, pathPattern: string, since: Date): Promise<string>;
  // Every link already received since `since`, newest first. It does not wait.
  links(to: string, pathPattern: string, since: Date): Promise<string[]>;
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
  onTimeout: () => Error | Promise<Error>,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  do {
    const found = await attempt();
    if (found) return found;
    await sleep(pollMs);
  } while (Date.now() < deadline);
  throw await onTimeout();
}

const DAY_MS = 24 * 60 * 60 * 1000;

// IMAP SINCE compares whole days in the server's time zone (Gmail's is behind UTC), so asking
// from the exact moment would hide today's mail after UTC midnight. Start a day early and let
// `isFresh` apply the exact time.
const searchFrom = (since: Date): Date => new Date(since.getTime() - DAY_MS);

const ENVELOPE = { envelope: true, internalDate: true } as const;

const TAGGED_SHOWN = 10;

// Only the tags of the seed's own account: the rest of the mailbox is someone's personal mail.
function taggedOf(
  headers: {
    seq: number;
    envelope?: { to?: { address?: string }[] };
    internalDate?: Date | string;
  }[],
  to: string,
): string[] {
  const at = to.lastIndexOf('@');
  const prefix = `${to.slice(0, at).split('+')[0]}+`;
  const domain = to.slice(at);
  return [...headers]
    .sort((a, b) => b.seq - a.seq)
    .flatMap(({ envelope, internalDate }) =>
      (envelope?.to ?? []).flatMap(({ address }) => {
        const lower = address?.toLowerCase() ?? '';
        if (!lower.startsWith(prefix) || !lower.endsWith(domain)) return [];
        const tag = lower.slice(prefix.length - 1, lower.length - domain.length);
        const when = internalDate ? new Date(internalDate).toISOString() : 'unknown time';
        return [`${tag} at ${when}`];
      }),
    )
    .slice(0, TAGGED_SHOWN);
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

  async links(to: string, pathPattern: string, since: Date): Promise<string[]> {
    return this.scan(to, pathPattern, since);
  }

  private async find(to: string, pathPattern: string, since: Date): Promise<string | null> {
    return (await this.scan(to, pathPattern, since, 1))[0] ?? null;
  }

  private async scan(
    to: string,
    pathPattern: string,
    since: Date,
    limit = Infinity,
  ): Promise<string[]> {
    const query = encodeURIComponent(`to:${to}`);
    const search = await this.fetchImpl(`${this.baseUrl}/api/v1/search?query=${query}`);
    const { messages } = (await search.json()) as { messages: { ID: string; Created: string }[] };
    const found: string[] = [];
    for (const { ID, Created } of messages) {
      if (found.length >= limit) break;
      if (!isFresh(new Date(Created), since)) continue;
      const message = await this.fetchImpl(`${this.baseUrl}/api/v1/message/${ID}`);
      const { HTML } = (await message.json()) as { HTML: string };
      const link = extractLink(HTML, pathPattern);
      if (link) found.push(link);
    }
    return found;
  }
}

// The part of ImapFlow the seed uses, so tests do not need a server.
export interface ImapClientLike {
  connect(): Promise<void>;
  logout(): Promise<void>;
  list(): Promise<{ path: string; specialUse?: string }[]>;
  getMailboxLock(path: string): Promise<{ release(): void }>;
  search(query: { since: Date }): Promise<number[] | false | undefined>;
  fetchAll(
    range: string,
    query: { envelope: true; internalDate: true },
  ): Promise<
    {
      seq: number;
      envelope?: { to?: { address?: string }[] };
      internalDate?: Date | string;
    }[]
  >;
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
  private addressed = 0;
  private arrived = 0;
  private folder = 'INBOX';
  // The tags of the same account seen in the last search, newest first, for the error message.
  private tagged: string[] = [];

  constructor(
    private readonly options: ImapOptions,
    extras: { createClient?: (options: ImapOptions) => ImapClientLike } & Polling = {},
  ) {
    const { createClient = connect, ...polling } = extras;
    this.createClient = createClient;
    this.polling = polling;
  }

  async latestLink(to: string, pathPattern: string, since: Date): Promise<string> {
    return this.withClient((client, folder) =>
      poll(
        this.polling,
        async () => (await this.scan(client, folder, to, pathPattern, since, 1))[0] ?? null,
        () =>
          new Error(
            `${missing(to, pathPattern).message} (IMAP: ${this.addressed} addressed to it, ${this.arrived} arrived in ${this.folder} since ${since.toISOString()}; tagged addresses seen: ${this.tagged.join(', ') || 'none'})`,
          ),
      ),
    );
  }

  links(to: string, pathPattern: string, since: Date): Promise<string[]> {
    return this.withClient((client, folder) => this.scan(client, folder, to, pathPattern, since));
  }

  private async withClient<T>(
    work: (client: ImapClientLike, folder: string) => Promise<T>,
  ): Promise<T> {
    const client = this.createClient(this.options);
    try {
      await client.connect();
      const folders = await client.list();
      const folder = folders.find(({ specialUse }) => specialUse === '\\All')?.path ?? 'INBOX';
      this.folder = folder;
      return await work(client, folder);
    } finally {
      await client.logout().catch(() => undefined);
    }
  }

  // Searches all mail, not the inbox: Gmail files what an account sends to its own tagged
  // addresses as sent mail. The recipient is checked here, since a mailbox holds everyone's mail.
  private async scan(
    client: ImapClientLike,
    folder: string,
    to: string,
    pathPattern: string,
    since: Date,
    limit = Infinity,
  ): Promise<string[]> {
    const lock = await client.getMailboxLock(folder);
    try {
      const arrived = (await client.search({ since: searchFrom(since) })) || [];
      this.arrived = arrived.length;
      const headers = arrived.length > 0 ? await client.fetchAll(arrived.join(','), ENVELOPE) : [];
      const wanted = to.toLowerCase();
      const addressed = headers
        .filter(({ envelope }) =>
          (envelope?.to ?? []).some(({ address }) => address?.toLowerCase() === wanted),
        )
        .sort((a, b) => b.seq - a.seq);
      this.addressed = addressed.length;
      this.tagged = taggedOf(headers, wanted);
      const found: string[] = [];
      for (const { seq } of addressed) {
        if (found.length >= limit) break;
        const message = await client.fetchOne(String(seq), { source: true, internalDate: true });
        if (!message || !message.source || !message.internalDate) continue;
        if (!isFresh(new Date(message.internalDate), since)) continue;
        const link = extractLink(htmlOf(message.source.toString('utf8')), pathPattern);
        if (link) found.push(link);
      }
      return found;
    } finally {
      lock.release();
    }
  }
}
