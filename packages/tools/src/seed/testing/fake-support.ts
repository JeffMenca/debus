import type { Session } from '../gateway-client';
import { GatewayError } from '../gateway-client';

export type Row = Record<string, unknown> & { id: string };
export type Body = Record<string, unknown>;

export const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const page = (items: unknown[], summary: unknown) => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 100,
  summary,
});

// A page of the rows a request asks for, with the real totals.
export function paged<T>(items: T[], query: URLSearchParams, maxPageSize = 100) {
  const pageSize = Math.min(Number(query.get('pageSize') ?? 100), maxPageSize);
  const number = Number(query.get('page') ?? 1);
  return {
    items: items.slice((number - 1) * pageSize, number * pageSize),
    total: items.length,
    page: number,
    pageSize,
  };
}

export const conflict = (message: string) => new GatewayError(409, message);
export const notFound = (message: string) => new GatewayError(404, message);
export const unprocessable = (message: string) => new GatewayError(422, message);
export const badRequest = (message: string) => new GatewayError(400, message);

export interface FakeRequest {
  session: Session | null;
  method: string;
  url: URL;
  body: Body;
  headers: Record<string, string>;
}

// What a request that no extension answers returns, so the next one can try.
export const NO_ROUTE = Symbol('no route');

// A piece of the fake API that lives in its own file: it answers the routes it knows and says
// NO_ROUTE for the rest.
export interface FakeExtension {
  route(request: FakeRequest): unknown;
}

export const keyOf = (request: FakeRequest): string => {
  const key = Object.entries(request.headers).find(
    ([name]) => name.toLowerCase() === 'idempotency-key',
  )?.[1];
  if (!key) throw badRequest('Falta la clave de la operación.');
  return key;
};

export const cents = (amount: number): number => Math.round(amount * 100);
