import { passwordSchema, todayInGuatemala } from '@debus/contracts';
import { SEED_AREAS, type SeedArea } from './areas';
import { ensureSignedIn } from './accounts';
import { createContext, type SeedContext } from './context';
import { GatewayClient, type Gateway } from './gateway-client';
import { ImapMailbox, MailpitMailbox, type Mailbox } from './mailbox';
import type { SeedReport } from './report';

export interface SeedOptions {
  target: 'local' | 'production';
  only?: string[];
  daysAhead: number;
}

// The defaults of the local stack. They are in the repository, so no deployed account may use them.
export const LOCAL_PASSWORD = 'debus-demo-2026';
export const LOCAL_ADMIN_PASSWORD = 'clave-segura-1';
const PUBLISHED_PASSWORDS: readonly string[] = [LOCAL_PASSWORD, LOCAL_ADMIN_PASSWORD];

const DEFAULT_DAYS_AHEAD = 7;
const MAX_DAYS_AHEAD = 30;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
const FLAGS = new Set(['--target', '--only', '--days-ahead']);
const AREA_NAMES = new Set(SEED_AREAS.map((area) => area.name));

function valueOf(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (value === undefined) throw new Error(`${flag} needs a value`);
  return value;
}

function parseDaysAhead(raw: string): number {
  const days = Number(raw);
  if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS_AHEAD) {
    throw new Error(
      `--days-ahead must be a whole number from 1 to ${MAX_DAYS_AHEAD}, got "${raw}"`,
    );
  }
  return days;
}

// Loading production by accident would put demo accounts and trips in front of real people, so it
// takes three separate decisions: the flag, the confirmation and a password of its own.
function assertSafeProduction(env: NodeJS.ProcessEnv): void {
  if (env.SEED_CONFIRM !== 'production') {
    throw new Error('Seeding production needs SEED_CONFIRM=production');
  }
  if (!env.SEED_PASSWORD || !passwordSchema.safeParse(env.SEED_PASSWORD).success) {
    throw new Error('Seeding production needs SEED_PASSWORD of at least 8 characters');
  }
  if (PUBLISHED_PASSWORDS.includes(env.SEED_PASSWORD)) {
    throw new Error('SEED_PASSWORD is a local default that is published in the repository');
  }
  if (!env.SEED_API_URL) throw new Error('Seeding production needs SEED_API_URL');
  if (LOCAL_HOSTS.has(new URL(env.SEED_API_URL).hostname)) {
    throw new Error('SEED_API_URL points to this machine: production is a deployed gateway');
  }
}

export function seedOptionsFrom(argv: readonly string[], env: NodeJS.ProcessEnv): SeedOptions {
  let target: SeedOptions['target'] = 'local';
  let daysAhead = DEFAULT_DAYS_AHEAD;
  const only: string[] = [];
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index] ?? '';
    if (!FLAGS.has(flag)) throw new Error(`Unknown argument "${flag}"`);
    const value = valueOf(argv, index, flag);
    if (flag === '--target') {
      if (value !== 'local' && value !== 'production') {
        throw new Error(`--target must be local or production, got "${value}"`);
      }
      target = value;
    } else if (flag === '--only') {
      only.push(
        ...value
          .split(',')
          .map((name) => name.trim())
          .filter(Boolean),
      );
    } else {
      daysAhead = parseDaysAhead(value);
    }
  }
  const unknown = only.find((name) => !AREA_NAMES.has(name));
  if (unknown) {
    throw new Error(`Unknown area "${unknown}". Areas: ${[...AREA_NAMES].join(', ')}`);
  }
  if (target === 'production') assertSafeProduction(env);
  return { target, daysAhead, ...(only.length > 0 && { only }) };
}

export type SeedMailboxConfig =
  { kind: 'mailpit'; url: string } | { kind: 'imap'; host: string; user: string; password: string };

export interface SeedConfig {
  apiUrl: string;
  adminEmail: string;
  adminPassword: string;
  // The password of every account the seed creates.
  password: string;
  emailBase: string;
  mailbox: SeedMailboxConfig;
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`Seeding production needs ${name}`);
  return value;
}

export function seedConfigFrom(options: SeedOptions, env: NodeJS.ProcessEnv): SeedConfig {
  if (options.target === 'local') {
    return {
      apiUrl: env.SEED_API_URL ?? 'http://localhost:4000',
      adminEmail: env.SEED_ADMIN_EMAIL ?? 'admin@debus.local',
      adminPassword: env.SEED_ADMIN_PASSWORD ?? LOCAL_ADMIN_PASSWORD,
      password: env.SEED_PASSWORD ?? LOCAL_PASSWORD,
      emailBase: env.SEED_EMAIL_BASE ?? 'seed@debus.local',
      mailbox: { kind: 'mailpit', url: env.SEED_MAILPIT_URL ?? 'http://localhost:8025' },
    };
  }
  const user = required(env, 'SMTP_USER');
  const adminPassword = required(env, 'SEED_ADMIN_PASSWORD');
  if (PUBLISHED_PASSWORDS.includes(adminPassword)) {
    throw new Error('SEED_ADMIN_PASSWORD is a local default that is published in the repository');
  }
  return {
    apiUrl: required(env, 'SEED_API_URL'),
    adminEmail: required(env, 'SEED_ADMIN_EMAIL'),
    adminPassword,
    password: required(env, 'SEED_PASSWORD'),
    emailBase: env.SEED_EMAIL_BASE ?? user,
    mailbox: {
      kind: 'imap',
      host: env.SEED_IMAP_HOST ?? 'imap.gmail.com',
      user,
      password: required(env, 'SMTP_PASSWORD'),
    },
  };
}

export interface SeedConnections {
  client?: Gateway;
  mailbox?: Mailbox;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  log?: (message: string) => void;
}

// Signs in the system admin that creates the structure and gathers what every area needs.
export async function createSeedContext(
  config: SeedConfig,
  daysAhead: number,
  connections: SeedConnections = {},
): Promise<SeedContext> {
  const client = connections.client ?? new GatewayClient(config.apiUrl, connections.fetchImpl);
  const mailbox =
    connections.mailbox ??
    (config.mailbox.kind === 'mailpit'
      ? new MailpitMailbox(config.mailbox.url, connections.fetchImpl)
      : new ImapMailbox(config.mailbox));
  const admin = await ensureSignedIn(client, mailbox, config.adminEmail, config.adminPassword);
  if (admin.user.role !== 'SYSTEM_ADMIN') {
    throw new Error(
      `${config.adminEmail} is not a system admin, so it cannot create the structure`,
    );
  }
  const now = connections.now ?? (() => new Date());
  return createContext({
    client,
    mailbox,
    admin,
    emailBase: config.emailBase,
    password: config.password,
    today: todayInGuatemala(now()),
    daysAhead,
    now,
    ...(connections.log && { log: connections.log }),
  });
}

export interface SeedDeps {
  ctx: SeedContext;
  areas?: readonly SeedArea[];
}

// Runs the areas in order. An area with nothing to do is not an error; one that fails stops the
// seed, because the ones after it count on its work.
export async function runSeed(options: SeedOptions, deps: SeedDeps): Promise<SeedReport[]> {
  const ctx: SeedContext = { ...deps.ctx, daysAhead: options.daysAhead };
  const reports: SeedReport[] = [];
  for (const area of deps.areas ?? SEED_AREAS) {
    if (options.only && !options.only.includes(area.name)) continue;
    ctx.log(`Area ${area.name}`);
    try {
      reports.push(await area.run(ctx));
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`The seed stopped at the area "${area.name}": ${reason}`, { cause: error });
    }
  }
  return reports;
}
