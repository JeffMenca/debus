import type { Gateway, Session } from './gateway-client';
import type { Mailbox } from './mailbox';
import type { RetryOptions } from './retry';

export interface SeedContext {
  client: Gateway;
  mailbox: Mailbox;
  // A system admin: creates the structure.
  admin: Session;
  emailBase: string;
  // The password of every account the seed creates.
  password: string;
  // Today in Guatemala, as YYYY-MM-DD.
  today: string;
  daysAhead: number;
  // How long and how often to wait for a copy that has not arrived yet.
  retry: RetryOptions;
  now(): Date;
  log(message: string): void;
  // Filled by the stages as they go: whoever runs later can rely on what ran before.
  branchIds: Map<string, string>;
  branchAdmins: Map<string, Session>;
  registeredDrivers: Set<string>;
  // The clients of the demo, by their number in the catalog.
  clientSessions: Map<number, Session>;
}

export interface SeedContextInit {
  client: Gateway;
  mailbox: Mailbox;
  admin: Session;
  emailBase: string;
  password: string;
  today: string;
  daysAhead?: number;
  retry?: RetryOptions;
  now?: () => Date;
  log?: (message: string) => void;
}

export function createContext(init: SeedContextInit): SeedContext {
  return {
    ...init,
    daysAhead: init.daysAhead ?? 7,
    retry: init.retry ?? {},
    now: init.now ?? (() => new Date()),
    log: init.log ?? (() => undefined),
    branchIds: new Map(),
    branchAdmins: new Map(),
    registeredDrivers: new Set(),
    clientSessions: new Map(),
  };
}
