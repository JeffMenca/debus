import type { ClientProfile, Page, Wallet, WalletMovement } from '@debus/contracts';

export const CLIENT_ID = '7d6c5b4a-3f2e-4d1c-8b0a-9f8e7d6c5b4a';

export const wallet = (over: Partial<Wallet> = {}): Wallet => ({
  balance: 340,
  updatedAt: '2026-10-14T15:00:00.000Z',
  ...over,
});

export const profile = (over: Partial<ClientProfile> = {}): ClientProfile => ({
  userId: CLIENT_ID,
  email: 'ana.mendez@correo.com',
  fullName: 'Ana Méndez',
  dpi: '2734519200901',
  phone: '55123489',
  nit: '45218376',
  address: 'Zona 3, Quetzaltenango',
  updatedAt: '2026-10-14T15:00:00.000Z',
  ...over,
});

export const movement = (over: Partial<WalletMovement> = {}): WalletMovement => ({
  id: 'b1a2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  kind: 'TOP_UP',
  amount: 100,
  balanceAfter: 340,
  reference: null,
  description: 'Recarga de saldo',
  occurredOn: '2026-10-14',
  createdAt: '2026-10-14T15:00:00.000Z',
  ...over,
});

export const movementPage = (
  items: WalletMovement[],
  over: Partial<Page<WalletMovement>> = {},
): Page<WalletMovement> => ({ items, total: items.length, page: 1, pageSize: 20, ...over });

type Handler = (init: RequestInit) => Response | Promise<Response>;

// Answers the clientes API by "METHOD /path" (the path without the query); anything else fails.
export function mockClientesApi(routes: Record<string, Handler>) {
  return jest.spyOn(global, 'fetch').mockImplementation(async (input, init = {}) => {
    const url = new URL(String(input));
    const route = `${init.method ?? 'GET'} ${url.pathname.replace('/api/clientes', '')}`;
    const handler = routes[route];
    if (!handler) throw new Error(`unexpected request ${route}`);
    return handler(init);
  });
}

export const apiError = (status: number, message: string) =>
  Response.json({ statusCode: status, error: 'Error', message }, { status });
