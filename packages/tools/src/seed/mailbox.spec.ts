import { ImapMailbox, MailpitMailbox, type ImapClientLike } from './mailbox';

const LINK_PATH = '/(?:crear-contrasena|restablecer)';
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

function mailpit(routes: Record<string, () => Response>) {
  const urls: string[] = [];
  const impl = (async (url: string | URL | Request) => {
    const text = String(url);
    urls.push(text);
    const key = Object.keys(routes).find((prefix) => text.includes(prefix));
    if (!key) throw new Error(`unexpected ${text}`);
    return (routes[key] as () => Response)();
  }) as unknown as typeof fetch;
  return { impl, urls };
}

describe('MailpitMailbox', () => {
  const since = new Date('2026-10-15T10:00:00.000Z');

  it('searches by recipient and returns the path and query of the link', async () => {
    const { impl, urls } = mailpit({
      '/api/v1/search': () =>
        json({ messages: [{ ID: 'm1', Created: '2026-10-15T10:00:05.000Z' }] }),
      '/api/v1/message/m1': () =>
        json({ HTML: '<a href="http://web/crear-contrasena?token=abc&amp;x=1">Crear</a>' }),
    });
    const link = await new MailpitMailbox('http://mail:8025/', impl).latestLink(
      'seed+admin@debus.local',
      LINK_PATH,
      since,
    );
    expect(link).toBe('/crear-contrasena?token=abc&x=1');
    expect(urls[0]).toBe(
      `http://mail:8025/api/v1/search?query=${encodeURIComponent('to:seed+admin@debus.local')}`,
    );
  });

  it('takes the first message whose link matches the pattern and ignores older ones', async () => {
    const { impl } = mailpit({
      '/api/v1/search': () =>
        json({
          messages: [
            { ID: 'welcome', Created: '2026-10-15T10:00:09.000Z' },
            { ID: 'reset', Created: '2026-10-15T10:00:08.000Z' },
            { ID: 'old', Created: '2026-10-15T09:00:00.000Z' },
          ],
        }),
      '/api/v1/message/welcome': () => json({ HTML: '<a href="http://web/login">Entrar</a>' }),
      '/api/v1/message/reset': () =>
        json({ HTML: '<a href="http://web/restablecer?token=zzz">Restablecer</a>' }),
      '/api/v1/message/old': () => {
        throw new Error('an email from before the request must not be opened');
      },
    });
    await expect(
      new MailpitMailbox('http://mail:8025', impl).latestLink('a@debus.local', LINK_PATH, since),
    ).resolves.toBe('/restablecer?token=zzz');
  });

  it('retries until the email arrives', async () => {
    let searches = 0;
    const { impl } = mailpit({
      '/api/v1/search': () => {
        searches += 1;
        return json({
          messages: searches < 3 ? [] : [{ ID: 'm1', Created: '2026-10-15T10:00:05.000Z' }],
        });
      },
      '/api/v1/message/m1': () => json({ HTML: '<a href="http://web/restablecer?token=t">x</a>' }),
    });
    const mailbox = new MailpitMailbox('http://mail:8025', impl, { pollMs: 0 });
    await expect(mailbox.latestLink('a@debus.local', LINK_PATH, since)).resolves.toBe(
      '/restablecer?token=t',
    );
    expect(searches).toBe(3);
  });

  it('lists every link of the window, newest first, without waiting', async () => {
    const { impl } = mailpit({
      '/api/v1/search': () =>
        json({
          messages: [
            { ID: 'new', Created: '2026-10-15T10:00:09.000Z' },
            { ID: 'login', Created: '2026-10-15T10:00:08.000Z' },
            { ID: 'old', Created: '2026-10-15T10:00:07.000Z' },
            { ID: 'stale', Created: '2026-10-15T09:00:00.000Z' },
          ],
        }),
      '/api/v1/message/new': () => json({ HTML: '<a href="http://web/restablecer?token=n">x</a>' }),
      '/api/v1/message/login': () => json({ HTML: '<a href="http://web/login">x</a>' }),
      '/api/v1/message/old': () =>
        json({ HTML: '<a href="http://web/crear-contrasena?token=o">x</a>' }),
      '/api/v1/message/stale': () => {
        throw new Error('an email from before the window must not be opened');
      },
    });
    await expect(
      new MailpitMailbox('http://mail:8025', impl).links('a@debus.local', LINK_PATH, since),
    ).resolves.toEqual(['/restablecer?token=n', '/crear-contrasena?token=o']);
  });

  it('fails when no email arrives in time', async () => {
    const { impl } = mailpit({ '/api/v1/search': () => json({ messages: [] }) });
    const mailbox = new MailpitMailbox('http://mail:8025', impl, { timeoutMs: 20, pollMs: 5 });
    await expect(mailbox.latestLink('a@debus.local', LINK_PATH, since)).rejects.toThrow(
      'No email with a link to /(?:crear-contrasena|restablecer) reached a@debus.local',
    );
  });
});

interface Stored {
  seq: number;
  date: Date;
  to: string;
  token?: string;
}

const NOW = new Date('2026-10-15T10:00:00.000Z');
// Gmail names it after the account's language; the special-use flag is what identifies it.
const ALL_MAIL = '[Gmail]/Todos';
const GMAIL_FOLDERS = [
  { path: 'INBOX' },
  { path: '[Gmail]/Enviados', specialUse: '\\Sent' },
  { path: ALL_MAIL, specialUse: '\\All' },
];

function fakeImap(
  stored: Stored[],
  folders: { path: string; specialUse?: string }[] = GMAIL_FOLDERS,
) {
  const state = {
    searched: [] as unknown[],
    fetched: [] as string[],
    locked: [] as string[],
    released: 0,
    closed: 0,
  };
  const sourceOf = ({ token }: Stored) =>
    [
      'Content-Type: text/html',
      '',
      token ? `<a href="http://web/restablecer?token=${token}">x</a>` : '<p>hola</p>',
    ].join('\r\n');
  const client: ImapClientLike = {
    connect: async () => undefined,
    logout: async () => {
      state.closed += 1;
    },
    list: async () => folders,
    getMailboxLock: async (path) => {
      state.locked.push(path);
      return {
        release: () => {
          state.released += 1;
        },
      };
    },
    search: async (query) => {
      state.searched.push(query);
      return stored.map((message) => message.seq);
    },
    fetchAll: async (range) => {
      const wanted = range.split(',').map(Number);
      return stored
        .filter((message) => wanted.includes(message.seq))
        .map((message) => ({
          seq: message.seq,
          internalDate: message.date,
          envelope: { to: [{ address: message.to }] },
        }));
    },
    fetchOne: async (seq) => {
      state.fetched.push(seq);
      const found = stored.find((message) => message.seq === Number(seq));
      return found ? { source: Buffer.from(sourceOf(found)), internalDate: found.date } : false;
    },
  };
  return { client, state };
}

describe('ImapMailbox', () => {
  const since = NOW;
  // IMAP compares days in the server's time zone, so the search starts a day early.
  const searchFrom = new Date('2026-10-14T10:00:00.000Z');
  const options = { host: 'imap.test', user: 'equipo@gmail.com', password: 'secret' };
  const at = (seconds: number) => new Date(NOW.getTime() + seconds * 1000);
  const mailboxOf = (client: ImapClientLike, polling = {}) =>
    new ImapMailbox(options, { createClient: () => client, ...polling });

  it('reads the newest link of the messages addressed to the account', async () => {
    const { client, state } = fakeImap([
      { seq: 1, date: at(2), to: 'equipo+admin@gmail.com', token: 'old' },
      { seq: 2, date: at(6), to: 'Equipo+Admin@gmail.com', token: 'new' },
      { seq: 3, date: at(8), to: 'equipo+cajero@gmail.com', token: 'other' },
    ]);
    const factory = jest.fn(() => client);
    const mailbox = new ImapMailbox(options, { createClient: factory });
    await expect(mailbox.latestLink('equipo+admin@gmail.com', LINK_PATH, since)).resolves.toBe(
      '/restablecer?token=new',
    );
    expect(factory).toHaveBeenCalledWith(options);
    expect(state.searched).toEqual([{ since: searchFrom }]);
    expect(state.fetched).toEqual(['2']);
    expect(state.released).toBe(1);
    expect(state.closed).toBe(1);
  });

  // Gmail files what an account sends to its own tagged addresses as sent mail, outside the inbox.
  it('searches the mailbox that holds every message', async () => {
    const { client, state } = fakeImap([{ seq: 1, date: at(1), to: 'a@gmail.com', token: 't' }]);
    await mailboxOf(client).links('a@gmail.com', LINK_PATH, since);
    expect(state.locked).toEqual([ALL_MAIL]);
  });

  it('searches the inbox when the server has no such mailbox', async () => {
    const { client, state } = fakeImap(
      [{ seq: 1, date: at(1), to: 'a@gmail.com', token: 't' }],
      [{ path: 'INBOX' }],
    );
    await mailboxOf(client).links('a@gmail.com', LINK_PATH, since);
    expect(state.locked).toEqual(['INBOX']);
  });

  it('ignores messages from before the request', async () => {
    const { client } = fakeImap([{ seq: 1, date: at(-3600), to: 'a@gmail.com', token: 'stale' }]);
    await expect(
      mailboxOf(client, { timeoutMs: 20, pollMs: 5 }).latestLink('a@gmail.com', LINK_PATH, since),
    ).rejects.toThrow('No email with a link to');
  });

  it('lists every link of the window, newest first, without waiting', async () => {
    const { client } = fakeImap([
      { seq: 1, date: at(1), to: 'a@gmail.com', token: 'first' },
      { seq: 2, date: at(2), to: 'b@gmail.com', token: 'other' },
      { seq: 3, date: at(3), to: 'a@gmail.com' },
      { seq: 4, date: at(4), to: 'a@gmail.com', token: 'last' },
    ]);
    await expect(mailboxOf(client).links('a@gmail.com', LINK_PATH, since)).resolves.toEqual([
      '/restablecer?token=last',
      '/restablecer?token=first',
    ]);
  });

  it('returns no links when nothing arrived', async () => {
    const { client } = fakeImap([]);
    client.search = async () => false;
    await expect(mailboxOf(client).links('a@gmail.com', LINK_PATH, since)).resolves.toEqual([]);
  });

  it('says what the inbox held when no link showed up', async () => {
    const { client, state } = fakeImap([
      { seq: 1, date: at(1), to: 'b@gmail.com', token: 'x' },
      { seq: 2, date: at(2), to: 'a@gmail.com' },
      { seq: 3, date: at(3), to: 'c@gmail.com', token: 'y' },
    ]);
    await expect(
      mailboxOf(client, { timeoutMs: 20, pollMs: 5 }).latestLink('a@gmail.com', LINK_PATH, since),
    ).rejects.toThrow(
      /reached a@gmail\.com \(IMAP: 1 addressed to it, 3 arrived in \[Gmail\]\/Todos since 2026-10-15T10:00:00\.000Z\)/,
    );
    expect(state.closed).toBe(1);
  });

  it('closes the connection even when the search fails', async () => {
    const { client, state } = fakeImap([]);
    client.search = async () => {
      throw new Error('boom');
    };
    await expect(mailboxOf(client).latestLink('a@gmail.com', LINK_PATH, since)).rejects.toThrow(
      'boom',
    );
    expect(state.closed).toBe(1);
    expect(state.released).toBe(1);
  });

  it('closes the connection when it could not even be opened', async () => {
    const { client, state } = fakeImap([]);
    client.connect = async () => {
      throw new Error('auth failed');
    };
    await expect(mailboxOf(client).latestLink('a@gmail.com', LINK_PATH, since)).rejects.toThrow(
      'auth failed',
    );
    expect(state.closed).toBe(1);
  });
});
