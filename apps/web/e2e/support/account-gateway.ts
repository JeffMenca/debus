import { randomUUID } from 'node:crypto';
import {
  type ClientProfile,
  type WalletMovement,
  pageArgs,
  toPage,
  topUpRequestSchema,
  updateProfileRequestSchema,
  walletMovementListQuerySchema,
} from '@debus/contracts';
import type { Page, Route } from '@playwright/test';
import { fulfillJson } from './session';

export interface AccountSeed {
  balance?: number;
  profile?: Partial<ClientProfile>;
  movements?: WalletMovement[];
  // NITs held by other accounts: saving one answers 409, like the service.
  takenNits?: string[];
}

// The same texts the clientes service answers with.
export const ACCOUNT_MESSAGES = {
  nitTaken: 'Ese NIT ya está registrado en otra cuenta.',
  keyReused: 'Esta operación ya se hizo con otros datos. Recarga la página e intenta de nuevo.',
  invalid: 'Revisa los datos marcados e intenta de nuevo.',
} as const;

export const sampleMovement = (over: Partial<WalletMovement> = {}): WalletMovement => ({
  id: randomUUID(),
  kind: 'TOP_UP',
  amount: 100,
  balanceAfter: 100,
  reference: null,
  description: 'Recarga de saldo',
  occurredOn: '2026-10-01',
  createdAt: '2026-10-01T15:00:00.000Z',
  ...over,
});

const PATH = /\/api\/clientes\/(profile|wallet)(\/top-ups|\/movements)?(\?|$)/;

// Plays the profile and wallet routes of the clientes API with state: top-ups are applied once per
// Idempotency-Key and the movements are filtered and paged on the "server", newest first.
export async function mockAccountGateway(page: Page, seed: AccountSeed = {}) {
  let balance = seed.balance ?? 0;
  const movements = structuredClone(seed.movements ?? []);
  const keys = new Map<string, string>();
  const topUpKeys: string[] = [];
  let profile: ClientProfile = {
    userId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    email: 'ana.mendez@correo.com',
    fullName: 'Ana Méndez',
    dpi: '2734519200901',
    phone: '55123489',
    nit: '45218376',
    address: 'Zona 3, Quetzaltenango',
    updatedAt: '2026-10-14T15:00:00.000Z',
    ...seed.profile,
  };
  const wallet = () => ({ balance, updatedAt: new Date().toISOString() });
  const error = (route: Route, status: number, message: string) =>
    fulfillJson(route, status, { statusCode: status, message });

  await page.route(PATH, async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return fulfillJson(route, 204);
    const url = new URL(request.url());
    const [, resource, sub] = url.pathname.match(PATH) ?? [];
    const route_ = `${request.method()} ${resource}${sub ?? ''}`;

    if (route_ === 'GET profile') return fulfillJson(route, 200, profile);
    if (route_ === 'PUT profile') {
      const parsed = updateProfileRequestSchema.safeParse(request.postDataJSON());
      if (!parsed.success) return error(route, 400, ACCOUNT_MESSAGES.invalid);
      if (parsed.data.nit && seed.takenNits?.includes(parsed.data.nit)) {
        return error(route, 409, ACCOUNT_MESSAGES.nitTaken);
      }
      profile = {
        ...profile,
        dpi: parsed.data.dpi,
        phone: parsed.data.phone,
        nit: parsed.data.nit ?? null,
        address: parsed.data.address ?? null,
        updatedAt: new Date().toISOString(),
      };
      return fulfillJson(route, 200, profile);
    }
    if (route_ === 'GET wallet') return fulfillJson(route, 200, wallet());
    if (route_ === 'POST wallet/top-ups') {
      const key = request.headers()['idempotency-key'];
      const parsed = topUpRequestSchema.safeParse(request.postDataJSON());
      if (!key || !parsed.success) return error(route, 400, ACCOUNT_MESSAGES.invalid);
      topUpKeys.push(key);
      const fingerprint = JSON.stringify(parsed.data);
      const previous = keys.get(key);
      if (previous && previous !== fingerprint)
        return error(route, 409, ACCOUNT_MESSAGES.keyReused);
      if (!previous) {
        keys.set(key, fingerprint);
        balance = Math.round((balance + parsed.data.amount) * 100) / 100;
        movements.unshift(
          sampleMovement({
            amount: parsed.data.amount,
            balanceAfter: balance,
            occurredOn: parsed.data.paidOn,
            createdAt: new Date().toISOString(),
          }),
        );
      }
      return fulfillJson(route, 201, wallet());
    }
    if (route_ === 'GET wallet/movements') {
      const query = walletMovementListQuerySchema.parse(Object.fromEntries(url.searchParams));
      const filtered = movements.filter((item) => query.kind === 'all' || item.kind === query.kind);
      const { skip, take } = pageArgs(query);
      return fulfillJson(
        route,
        200,
        toPage(filtered.slice(skip, skip + take), filtered.length, query),
      );
    }
    return error(route, 404, 'No encontramos lo que buscas.');
  });

  return { topUpKeys, balance: () => balance };
}
