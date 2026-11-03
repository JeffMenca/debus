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

  it('fails when no email arrives in time', async () => {
    const { impl } = mailpit({ '/api/v1/search': () => json({ messages: [] }) });
    const mailbox = new MailpitMailbox('http://mail:8025', impl, { timeoutMs: 20, pollMs: 5 });
    await expect(mailbox.latestLink('a@debus.local', LINK_PATH, since)).rejects.toThrow(
      'No email with a link to /(?:crear-contrasena|restablecer) reached a@debus.local',
    );
  });
});

function fakeImap(messages: { seq: number; date: Date; source: string }[]) {
  const state = { searched: [] as unknown[], released: 0, closed: 0, connected: 0 };
  const client: ImapClientLike = {
    connect: async () => {
      state.connected += 1;
    },
    logout: async () => {
      state.closed += 1;
    },
    getMailboxLock: async (path) => {
      expect(path).toBe('INBOX');
      return {
        release: () => {
          state.released += 1;
        },
      };
    },
    search: async (query) => {
      state.searched.push(query);
      return messages.map((message) => message.seq);
    },
    fetchOne: async (seq) => {
      const found = messages.find((message) => message.seq === Number(seq));
      return found ? { source: Buffer.from(found.source), internalDate: found.date } : false;
    },
  };
  return { client, state };
}
const htmlMessage = (href: string) =>
  ['Content-Type: text/html', '', `<a href="${href}">x</a>`].join('\r\n');

describe('ImapMailbox', () => {
  const since = new Date('2026-10-15T10:00:00.000Z');
  const options = { host: 'imap.test', user: 'equipo@gmail.com', password: 'secret' };

  it('searches the inbox by recipient and date and reads the newest matching link', async () => {
    const { client, state } = fakeImap([
      {
        seq: 1,
        date: new Date('2026-10-15T10:00:02.000Z'),
        source: htmlMessage('http://web/restablecer?token=old'),
      },
      {
        seq: 2,
        date: new Date('2026-10-15T10:00:06.000Z'),
        source: htmlMessage('http://web/restablecer?token=new'),
      },
    ]);
    const factory = jest.fn(() => client);
    const mailbox = new ImapMailbox(options, { createClient: factory });
    await expect(mailbox.latestLink('equipo+admin@gmail.com', LINK_PATH, since)).resolves.toBe(
      '/restablecer?token=new',
    );
    expect(factory).toHaveBeenCalledWith(options);
    expect(state.searched[0]).toEqual({ to: 'equipo+admin@gmail.com', since });
    expect(state.released).toBe(1);
    expect(state.closed).toBe(1);
  });

  it('ignores messages from before the request', async () => {
    const { client } = fakeImap([
      {
        seq: 1,
        date: new Date('2026-10-15T09:00:00.000Z'),
        source: htmlMessage('http://web/restablecer?token=stale'),
      },
    ]);
    const mailbox = new ImapMailbox(options, {
      createClient: () => client,
      timeoutMs: 20,
      pollMs: 5,
    });
    await expect(mailbox.latestLink('a@gmail.com', LINK_PATH, since)).rejects.toThrow(
      'No email with a link to',
    );
  });

  it('says what the inbox held when no link showed up', async () => {
    const { client, state } = fakeImap([]);
    client.search = async (query) => {
      state.searched.push(query);
      return query.to ? [] : [4, 5, 6];
    };
    const mailbox = new ImapMailbox(options, {
      createClient: () => client,
      timeoutMs: 20,
      pollMs: 5,
    });
    await expect(mailbox.latestLink('a+admin@gmail.com', LINK_PATH, since)).rejects.toThrow(
      /reached a\+admin@gmail\.com \(IMAP: 0 matched the address, 3 arrived in the inbox since 2026-10-15T10:00:00\.000Z\)/,
    );
    expect(state.searched).toContainEqual({ since });
    expect(state.released).toBe(state.searched.length);
  });

  it('closes the connection even when the search fails', async () => {
    const { client, state } = fakeImap([]);
    client.search = async () => {
      throw new Error('boom');
    };
    const mailbox = new ImapMailbox(options, { createClient: () => client });
    await expect(mailbox.latestLink('a@gmail.com', LINK_PATH, since)).rejects.toThrow('boom');
    expect(state.closed).toBe(1);
    expect(state.released).toBe(1);
  });

  it('closes the connection when it could not even be opened', async () => {
    const { client, state } = fakeImap([]);
    client.connect = async () => {
      throw new Error('auth failed');
    };
    const mailbox = new ImapMailbox(options, { createClient: () => client });
    await expect(mailbox.latestLink('a@gmail.com', LINK_PATH, since)).rejects.toThrow(
      'auth failed',
    );
    expect(state.closed).toBe(1);
  });
});
