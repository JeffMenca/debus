import type { SeedArea } from './areas';
import { GatewayError } from './gateway-client';
import { createSeedContext, runSeed, seedConfigFrom, seedOptionsFrom } from './run-seed';
import { Tally } from './report';
import { FakeGateway, FakeMailbox } from './testing/fake-gateway';
import { NOW, setup } from './testing/setup';

const PRODUCTION_ENV = {
  SEED_CONFIRM: 'production',
  SEED_PASSWORD: 'clave-demo-2026',
  SEED_API_URL: 'https://gateway-123.us-central1.run.app',
  SEED_ADMIN_EMAIL: 'admin@debus.example',
  SEED_ADMIN_PASSWORD: 'admin-secret-1',
  SMTP_USER: 'equipo@gmail.com',
  SMTP_PASSWORD: 'app-password',
};

const without = (name: string): Record<string, string | undefined> => {
  const env: Record<string, string | undefined> = { ...PRODUCTION_ENV };
  delete env[name];
  return env;
};

describe('seedOptionsFrom', () => {
  it('runs everything against the local stack by default', () => {
    expect(seedOptionsFrom([], {})).toEqual({ target: 'local', daysAhead: 7 });
  });

  it('limits the areas with --only, by name or comma separated, and ignores an empty list', () => {
    expect(seedOptionsFrom(['--only', 'operations'], {}).only).toEqual(['operations']);
    expect(seedOptionsFrom(['--only', 'fleet,operations'], {}).only).toEqual([
      'fleet',
      'operations',
    ]);
    expect(seedOptionsFrom(['--only', 'fleet', '--only', 'accounts'], {}).only).toEqual([
      'fleet',
      'accounts',
    ]);
    expect(seedOptionsFrom(['--only', ''], {}).only).toBeUndefined();
  });

  it('rejects an area that does not exist', () => {
    expect(() => seedOptionsFrom(['--only', 'tickets'], {})).toThrow('Unknown area "tickets"');
  });

  it('reads --days-ahead and rejects what is not a small whole number', () => {
    expect(seedOptionsFrom(['--days-ahead', '3'], {}).daysAhead).toBe(3);
    expect(() => seedOptionsFrom(['--days-ahead', '0'], {})).toThrow('--days-ahead');
    expect(() => seedOptionsFrom(['--days-ahead', '90'], {})).toThrow('--days-ahead');
    expect(() => seedOptionsFrom(['--days-ahead', 'tres'], {})).toThrow('--days-ahead');
    expect(() => seedOptionsFrom(['--days-ahead'], {})).toThrow('--days-ahead');
  });

  it('rejects an unknown flag or target', () => {
    expect(() => seedOptionsFrom(['--force'], {})).toThrow('Unknown argument "--force"');
    expect(() => seedOptionsFrom(['--target', 'staging'], {})).toThrow('--target');
  });

  describe('production', () => {
    it('is accepted with the confirmation, a password and a real API address', () => {
      expect(seedOptionsFrom(['--target', 'production'], PRODUCTION_ENV)).toEqual({
        target: 'production',
        daysAhead: 7,
      });
    });

    it('needs SEED_CONFIRM=production', () => {
      const env = without('SEED_CONFIRM');
      expect(() => seedOptionsFrom(['--target', 'production'], env)).toThrow(
        'SEED_CONFIRM=production',
      );
      expect(() =>
        seedOptionsFrom(['--target', 'production'], { ...env, SEED_CONFIRM: 'yes' }),
      ).toThrow('SEED_CONFIRM=production');
    });

    it('needs a SEED_PASSWORD of at least 8 characters', () => {
      const env = without('SEED_PASSWORD');
      expect(() => seedOptionsFrom(['--target', 'production'], env)).toThrow('SEED_PASSWORD');
      expect(() =>
        seedOptionsFrom(['--target', 'production'], { ...env, SEED_PASSWORD: 'corta' }),
      ).toThrow('SEED_PASSWORD');
    });

    it.each(['debus-demo-2026', 'clave-segura-1'])(
      'refuses %s, a password that is published in the repository',
      (password) => {
        expect(() =>
          seedOptionsFrom(['--target', 'production'], {
            ...PRODUCTION_ENV,
            SEED_PASSWORD: password,
          }),
        ).toThrow('published');
      },
    );

    it.each(['http://localhost:4000', 'http://127.0.0.1:4000', 'http://[::1]:4000'])(
      'refuses the local address %s',
      (url) => {
        expect(() =>
          seedOptionsFrom(['--target', 'production'], { ...PRODUCTION_ENV, SEED_API_URL: url }),
        ).toThrow('SEED_API_URL');
      },
    );

    it('needs the API address', () => {
      expect(() => seedOptionsFrom(['--target', 'production'], without('SEED_API_URL'))).toThrow(
        'SEED_API_URL',
      );
    });
  });
});

describe('seedConfigFrom', () => {
  it('has local defaults that match the local stack', () => {
    expect(seedConfigFrom({ target: 'local', daysAhead: 7 }, {})).toEqual({
      apiUrl: 'http://localhost:4000',
      adminEmail: 'admin@debus.local',
      adminPassword: 'clave-segura-1',
      password: 'debus-demo-2026',
      emailBase: 'seed@debus.local',
      mailbox: { kind: 'mailpit', url: 'http://localhost:8025' },
    });
  });

  it('lets the environment override the local defaults', () => {
    const config = seedConfigFrom(
      { target: 'local', daysAhead: 7 },
      {
        SEED_API_URL: 'http://localhost:5000',
        SEED_PASSWORD: 'otra-clave-1',
        SEED_EMAIL_BASE: 'a@b.co',
      },
    );
    expect(config).toMatchObject({
      apiUrl: 'http://localhost:5000',
      password: 'otra-clave-1',
      emailBase: 'a@b.co',
    });
  });

  it('takes production from the deploy variables and reads the team inbox over IMAP', () => {
    expect(seedConfigFrom({ target: 'production', daysAhead: 7 }, PRODUCTION_ENV)).toEqual({
      apiUrl: 'https://gateway-123.us-central1.run.app',
      adminEmail: 'admin@debus.example',
      adminPassword: 'admin-secret-1',
      password: 'clave-demo-2026',
      emailBase: 'equipo@gmail.com',
      mailbox: {
        kind: 'imap',
        host: 'imap.gmail.com',
        user: 'equipo@gmail.com',
        password: 'app-password',
      },
    });
  });

  it('refuses the local admin password for the production admin', () => {
    expect(() =>
      seedConfigFrom(
        { target: 'production', daysAhead: 7 },
        { ...PRODUCTION_ENV, SEED_ADMIN_PASSWORD: 'clave-segura-1' },
      ),
    ).toThrow('published');
  });

  it.each(['SEED_ADMIN_EMAIL', 'SEED_ADMIN_PASSWORD', 'SMTP_USER', 'SMTP_PASSWORD'])(
    'asks for %s in production',
    (name) => {
      expect(() => seedConfigFrom({ target: 'production', daysAhead: 7 }, without(name))).toThrow(
        name,
      );
    },
  );
});

describe('createSeedContext', () => {
  const config = seedConfigFrom({ target: 'local', daysAhead: 7 }, {});

  it('signs in the system admin and sets the days ahead', async () => {
    const gateway = new FakeGateway(() => NOW);
    gateway.passwords.set('admin@debus.local', 'clave-segura-1');
    const ctx = await createSeedContext(config, 4, {
      client: gateway,
      mailbox: new FakeMailbox(gateway),
      now: () => NOW,
    });
    expect(ctx.admin.user.role).toBe('SYSTEM_ADMIN');
    expect(ctx.daysAhead).toBe(4);
    expect(ctx.today).toBe('2026-10-19');
    expect(ctx.emailBase).toBe('seed@debus.local');
    expect(ctx.password).toBe('debus-demo-2026');
  });

  it('refuses an account that is not a system admin', async () => {
    const gateway = new FakeGateway(() => NOW);
    gateway.login = async (email) => ({
      accessToken: 't',
      user: {
        id: '00000000-0000-4000-8000-000000000001',
        fullName: 'Cajero',
        email,
        role: 'CASHIER',
        branchId: null,
      },
    });
    await expect(
      createSeedContext(config, 7, {
        client: gateway,
        mailbox: new FakeMailbox(gateway),
        now: () => NOW,
      }),
    ).rejects.toThrow('system admin');
  });

  it('builds the real client and mailbox from the config when none are given', async () => {
    const fetchImpl = jest.fn(async () => {
      throw new GatewayError(503, 'down');
    }) as unknown as typeof fetch;
    await expect(createSeedContext(config, 7, { fetchImpl })).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalled();
  });
});

describe('runSeed', () => {
  const area = (name: string, run: SeedArea['run']): SeedArea => ({ name, owner: 'jeffrey', run });
  const done = (name: string) => new Tally(name).report();

  it('runs the areas in order and returns their reports', async () => {
    const order: string[] = [];
    const areas = ['one', 'two', 'three'].map((name) =>
      area(name, async () => {
        order.push(name);
        return done(name);
      }),
    );
    const { ctx } = setup();
    const reports = await runSeed({ target: 'local', daysAhead: 7 }, { ctx, areas });
    expect(order).toEqual(['one', 'two', 'three']);
    expect(reports.map((report) => report.area)).toEqual(['one', 'two', 'three']);
  });

  it('skips the areas that --only leaves out', async () => {
    const ran: string[] = [];
    const areas = ['one', 'two', 'three'].map((name) =>
      area(name, async () => {
        ran.push(name);
        return done(name);
      }),
    );
    const { ctx } = setup();
    await runSeed({ target: 'local', daysAhead: 7, only: ['three', 'one'] }, { ctx, areas });
    expect(ran).toEqual(['one', 'three']);
  });

  it('runs an area that appears twice each time it appears', async () => {
    const ran: string[] = [];
    const accounts = area('accounts', async () => {
      ran.push('accounts');
      return done('accounts');
    });
    const { ctx } = setup();
    await runSeed(
      { target: 'local', daysAhead: 7, only: ['accounts'] },
      { ctx, areas: [accounts, accounts] },
    );
    expect(ran).toEqual(['accounts', 'accounts']);
  });

  it('goes on with the next area when one has nothing to do yet', async () => {
    const ran: string[] = [];
    const empty: SeedArea = { name: 'clients', owner: 'roberto', run: async () => done('clients') };
    const next = area('next', async () => {
      ran.push('next');
      return done('next');
    });
    const { ctx } = setup();
    const reports = await runSeed({ target: 'local', daysAhead: 7 }, { ctx, areas: [empty, next] });
    expect(ran).toEqual(['next']);
    expect(reports).toHaveLength(2);
  });

  it('stops at the area that fails and names it', async () => {
    const ran: string[] = [];
    const areas = [
      area('one', async () => done('one')),
      area('two', async () => {
        throw new GatewayError(409, 'Ya existe un bus con esa placa.');
      }),
      area('three', async () => {
        ran.push('three');
        return done('three');
      }),
    ];
    const { ctx } = setup();
    await expect(runSeed({ target: 'local', daysAhead: 7 }, { ctx, areas })).rejects.toThrow(
      'The seed stopped at the area "two": Ya existe un bus con esa placa.',
    );
    expect(ran).toEqual([]);
  });

  it('keeps the context but takes the days ahead from the options', async () => {
    let seen = 0;
    const { ctx } = setup();
    await runSeed(
      { target: 'local', daysAhead: 3 },
      {
        ctx,
        areas: [
          area('one', async (inner) => {
            seen = inner.daysAhead;
            return done('one');
          }),
        ],
      },
    );
    expect(seen).toBe(3);
  });
});
