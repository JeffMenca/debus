import type { Session } from '../gateway-client';
import type { FakeGateway } from './fake-gateway';
import {
  NO_ROUTE,
  badRequest,
  cents,
  conflict,
  keyOf,
  notFound,
  paged,
  unprocessable,
  type Body,
  type FakeExtension,
  type FakeRequest,
  type Row,
} from './fake-support';

const MAX_TOP_UP = 100_000;
const KEY_REUSED =
  'Esta operación ya se hizo con otros datos. Recarga la página e intenta de nuevo.';
const NOT_ENOUGH = 'No tienes saldo suficiente en tu cartera.';
export const ACCOUNT_PENDING = 'Estamos preparando tu cuenta. Vuelve a intentar en unos segundos.';

interface Wallet {
  cents: number;
  updatedAt: string;
  movements: Row[];
  // The result of every operation by its key, with what it was asked for.
  operations: Map<string, { fingerprint: string; movement: Row }>;
}

export interface Charge {
  kind: 'TICKET' | 'RENTAL';
  amount: number;
  reference: string;
  description: string;
  occurredOn: string;
}

// Accounts of clients, their profile and their wallet, with the rules of the real ones that a
// seed can break: one result per idempotency key, and no spending what is not there.
export class FakeClients implements FakeExtension {
  private readonly wallets = new Map<string, Wallet>();
  private readonly profiles = new Map<string, Body>();

  constructor(private readonly gateway: FakeGateway) {}

  route(request: FakeRequest): unknown {
    const { session, method, url, body } = request;
    const key = `${method} ${url.pathname}`;
    if (key === 'POST /api/administracion/auth/signup') return this.signUp(body);
    if (key === 'GET /api/clientes/profile') return this.profile(session);
    if (key === 'PUT /api/clientes/profile') return this.updateProfile(session, body);
    if (key === 'GET /api/clientes/wallet') return this.view(this.walletOf(session));
    if (key === 'POST /api/clientes/wallet/top-ups') return this.topUp(request);
    if (key === 'GET /api/clientes/wallet/movements') return this.movements(session, url);
    return NO_ROUTE;
  }

  balanceOf(userId: string): number {
    return (this.wallets.get(userId)?.cents ?? 0) / 100;
  }

  profileOf(userId: string): Body | undefined {
    return this.profiles.get(userId);
  }

  // The debit ventas and the rentals make: once per reference, and only with the money there.
  debit(userId: string, charge: Charge): Row {
    const wallet = this.wallet(userId);
    const done = wallet.operations.get(charge.reference);
    if (done) return done.movement;
    if (wallet.cents < cents(charge.amount)) throw unprocessable(NOT_ENOUGH);
    return this.apply(userId, charge.reference, charge.kind, -charge.amount, charge);
  }

  // What was charged for a reference goes back, once.
  refund(userId: string, reference: string, description: string): void {
    const wallet = this.wallet(userId);
    const paid = wallet.operations.get(reference);
    const key = `refund:${reference}`;
    if (!paid || wallet.operations.has(key)) return;
    this.apply(userId, key, 'REFUND', -(paid.movement.amount as number), {
      reference,
      description,
      occurredOn: this.gateway.now().toISOString().slice(0, 10),
    });
  }

  private signUp(body: Body) {
    const email = String(body.email);
    const existing = this.gateway.users.find((user) => user.email === email);
    if (existing?.status === 'ACTIVE') return { message: 'ok' };
    const user: Row = existing ?? {
      id: this.gateway.nextId(),
      email,
      role: 'CLIENT',
      branchId: null,
      status: 'PENDING',
    };
    user.fullName = body.fullName;
    if (!existing) this.gateway.users.push(user);
    this.profiles.set(user.id, {
      userId: user.id,
      email,
      fullName: body.fullName,
      dpi: body.dpi ?? null,
      phone: body.phone ?? null,
      nit: body.nit ?? null,
      address: body.address ?? null,
      updatedAt: this.gateway.now().toISOString(),
    });
    // The activation link goes to the mailbox, where the fake mailbox finds it.
    this.gateway.forgot.push(email);
    return { message: 'ok' };
  }

  private userId(session: Session | null): string {
    if (!session) throw new Error('This route needs a session');
    return session.user.id;
  }

  private profile(session: Session | null): Body {
    const profile = this.profiles.get(this.userId(session));
    if (!profile) throw notFound(ACCOUNT_PENDING);
    return profile;
  }

  private updateProfile(session: Session | null, body: Body) {
    const profile = this.profile(session);
    Object.assign(profile, body, { updatedAt: this.gateway.now().toISOString() });
    return profile;
  }

  private wallet(userId: string): Wallet {
    const known = this.wallets.get(userId);
    if (known) return known;
    const created: Wallet = {
      cents: 0,
      updatedAt: this.gateway.now().toISOString(),
      movements: [],
      operations: new Map(),
    };
    this.wallets.set(userId, created);
    return created;
  }

  private walletOf(session: Session | null): Wallet {
    const userId = this.userId(session);
    if (!this.profiles.has(userId)) throw notFound(ACCOUNT_PENDING);
    return this.wallet(userId);
  }

  private view(wallet: Wallet) {
    return { balance: wallet.cents / 100, updatedAt: wallet.updatedAt };
  }

  private topUp(request: FakeRequest) {
    const wallet = this.walletOf(request.session);
    const key = keyOf(request);
    const { amount, paidOn } = request.body as { amount: number; paidOn: string };
    if (!(amount > 0) || amount > MAX_TOP_UP) throw badRequest('Datos no válidos.');
    const done = wallet.operations.get(key);
    const fingerprint = `${amount}|${paidOn}`;
    if (done) {
      if (done.fingerprint !== fingerprint) throw conflict(KEY_REUSED);
      return this.view(wallet);
    }
    this.apply(this.userId(request.session), key, 'TOP_UP', amount, {
      reference: null,
      description: 'Recarga de saldo',
      occurredOn: paidOn,
      fingerprint,
    });
    return this.view(wallet);
  }

  private apply(
    userId: string,
    key: string,
    kind: string,
    amount: number,
    detail: {
      reference: string | null;
      description: string;
      occurredOn: string;
      fingerprint?: string;
    },
  ): Row {
    const wallet = this.wallet(userId);
    wallet.cents += cents(amount);
    wallet.updatedAt = this.gateway.now().toISOString();
    const movement: Row = {
      id: this.gateway.nextId(),
      kind,
      amount,
      balanceAfter: wallet.cents / 100,
      reference: detail.reference,
      description: detail.description,
      occurredOn: detail.occurredOn,
      createdAt: wallet.updatedAt,
    };
    wallet.movements.push(movement);
    wallet.operations.set(key, { fingerprint: detail.fingerprint ?? '', movement });
    return movement;
  }

  private movements(session: Session | null, url: URL) {
    const wallet = this.walletOf(session);
    const kind = url.searchParams.get('kind') ?? 'all';
    const items = [...wallet.movements].reverse().filter((m) => kind === 'all' || m.kind === kind);
    return paged(items, url.searchParams);
  }
}
