import { randomUUID } from 'node:crypto';
import { type IncomingMessage, type Server, type ServerResponse, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

export type WalletMode =
  // answers as clientes does: applies the debit once per Idempotency-Key and repeats the answer
  | 'ok'
  | 'insufficient'
  // answers 404, as clientes does before the profile of the client has arrived
  | 'no-wallet'
  | 'unavailable'
  // applies the debit but the answer never arrives: the connection is cut
  | 'drop'
  // applies the debit after the 3 s timeout of the caller, so the answer comes too late
  | 'slow';
export type TripMode = 'open' | 'departed' | 'unavailable';

export interface StubCall {
  method: string;
  path: string;
  headers: IncomingMessage['headers'];
  body: Record<string, unknown> | null;
}

const SLOW_MS = 3500;
const SALE_STATUS = /^\/internal\/trips\/([0-9a-f-]{36})\/sale-status$/;

// Stands in for viajes and clientes on a real port, so the breaker, the timeouts and the retries of
// ServiceHttpClient run for real. Both are served from one address, apart by their paths.
export class PeerStub {
  wallet: WalletMode = 'ok';
  trip: TripMode = 'open';
  email = 'cliente.prueba@debus.test';
  readonly calls: StubCall[] = [];
  // Debits applied so far, by Idempotency-Key: what clientes keeps in its movements.
  readonly applied = new Map<string, { movementId: string; balance: number; email: string }>();
  private server!: Server;
  private readonly pending = new Set<NodeJS.Timeout>();

  get url(): string {
    return `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }

  debitCalls(): StubCall[] {
    return this.calls.filter((call) => call.method === 'POST');
  }

  reset(): void {
    this.wallet = 'ok';
    this.trip = 'open';
    this.calls.length = 0;
    this.applied.clear();
  }

  async start(): Promise<void> {
    this.server = createServer((req, res) => void this.handle(req, res));
    await new Promise<void>((resolve) => this.server.listen(0, '127.0.0.1', resolve));
  }

  async stop(): Promise<void> {
    for (const timer of this.pending) clearTimeout(timer);
    this.server.closeAllConnections();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const raw = await new Promise<string>((resolve) => {
      let text = '';
      req.on('data', (chunk: Buffer) => (text += chunk.toString()));
      req.on('end', () => resolve(text));
    });
    const path = req.url ?? '';
    const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
    this.calls.push({ method: req.method ?? '', path, headers: req.headers, body });

    const sale = SALE_STATUS.exec(path);
    if (req.method === 'GET' && sale) return this.saleStatus(res, sale[1]!);
    if (req.method === 'POST' && path === '/internal/wallet/debits') {
      return this.debit(req, res, body ?? {});
    }
    return send(res, 404, { message: 'Not found' });
  }

  private saleStatus(res: ServerResponse, tripId: string): void {
    if (this.trip === 'unavailable') return send(res, 503, { message: 'down' });
    if (this.trip === 'departed')
      return send(res, 200, { tripId, open: false, reason: 'DEPARTED' });
    return send(res, 200, { tripId, open: true });
  }

  private debit(req: IncomingMessage, res: ServerResponse, body: Record<string, unknown>): void {
    const key = String(req.headers['idempotency-key'] ?? '');
    const answer = (): { movementId: string; balance: number; email: string } => {
      const existing = this.applied.get(key);
      if (existing) return existing;
      const applied = {
        movementId: randomUUID(),
        balance: 1000 - Number(body.amount),
        email: this.email,
      };
      this.applied.set(key, applied);
      return applied;
    };

    switch (this.wallet) {
      case 'insufficient':
        return send(res, 422, { message: 'No tienes saldo suficiente en tu cartera.' });
      case 'no-wallet':
        return send(res, 404, { message: 'Estamos preparando tu cuenta.' });
      case 'unavailable':
        return send(res, 503, { message: 'down' });
      case 'drop':
        answer();
        req.socket.destroy();
        return;
      case 'slow': {
        const timer = setTimeout(() => {
          this.pending.delete(timer);
          send(res, 200, answer());
        }, SLOW_MS);
        this.pending.add(timer);
        return;
      }
      default:
        return send(res, 200, answer());
    }
  }
}

function send(res: ServerResponse, status: number, body: unknown): void {
  if (res.destroyed || res.writableEnded) return;
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}
