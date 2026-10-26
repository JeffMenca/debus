import { availableTripPageSchema, type AvailableTrip } from '@debus/contracts';
import { addDays } from '../dates';
import { GatewayError } from '../gateway-client';
import { SEED_CLIENTS } from '../clients-catalog';
import { NOW, TODAY } from '../testing/setup';
import { readyWorld } from '../testing/world';
import { clientSession } from './client-accounts';
import { SALE_FROM_DAYS_AHEAD, planSales } from './sales-plan';
import { salesArea } from './sales';

async function world() {
  const built = await readyWorld();
  const tripsOnSale = async (): Promise<AvailableTrip[]> =>
    (
      await built.gateway.request(
        built.ctx.admin,
        'GET',
        `/api/ventas/trips?from=${addDays(TODAY, SALE_FROM_DAYS_AHEAD)}&to=${addDays(TODAY, 7)}&pageSize=100`,
        undefined,
        availableTripPageSchema,
      )
    ).items;
  return { ...built, tripsOnSale };
}

// The second run happens a little later, as it does in life.
const later = (built: Awaited<ReturnType<typeof world>>, seconds: number) => {
  const at = new Date(NOW.getTime() + seconds * 1000);
  built.gateway.now = () => at;
  built.ctx.now = () => at;
};

describe('salesArea', () => {
  it('belongs to the sales and clients team', () => {
    expect(salesArea).toMatchObject({ name: 'sales', owner: 'roberto' });
  });

  it('sells what the plan says, online and at the counter', async () => {
    const built = await world();
    const planned = planSales(await built.tripsOnSale(), { today: TODAY });
    const report = await salesArea.run(built.ctx);
    const online = planned.filter((sale) => sale.channel === 'ONLINE').length;
    const counter = planned.length - online;
    expect(online).toBeGreaterThan(0);
    expect(report.counts['online tickets']).toEqual({ created: online, existing: 0 });
    expect(report.counts['counter tickets']).toEqual({ created: counter, existing: 0 });
    expect(built.gateway.sales.tickets).toHaveLength(planned.length);
  });

  it('sells only trips from the fourth day on', async () => {
    const built = await world();
    await salesArea.run(built.ctx);
    const first = Date.parse(`${addDays(TODAY, SALE_FROM_DAYS_AHEAD)}T06:00:00.000Z`);
    for (const ticket of built.gateway.sales.tickets) {
      expect(Date.parse(String(ticket.departureAt))).toBeGreaterThanOrEqual(first);
    }
  });

  it('sells nothing at all the second time, and changes no balance', async () => {
    const built = await world();
    await salesArea.run(built.ctx);
    const tickets = built.gateway.sales.tickets.length;
    const balances = [...built.ctx.clientSessions.values()].map((session) =>
      built.gateway.clients.balanceOf(session.user.id),
    );
    later(built, 60);
    built.gateway.requests.length = 0;
    const report = await salesArea.run(built.ctx);
    expect(report.counts['online tickets']?.created).toBe(0);
    expect(report.counts['counter tickets']?.created).toBe(0);
    expect(report.counts['online tickets']?.existing).toBeGreaterThan(0);
    expect(report.counts['counter tickets']?.existing).toBeGreaterThan(0);
    expect(built.gateway.count('POST', /\/purchases$/)).toBe(0);
    expect(built.gateway.count('POST', /top-ups$/)).toBe(0);
    expect(built.gateway.sales.tickets).toHaveLength(tickets);
    expect(
      [...built.ctx.clientSessions.values()].map((s) => built.gateway.clients.balanceOf(s.user.id)),
    ).toEqual(balances);
  });

  it('tops up a wallet before the purchase that needs it, and never goes below zero', async () => {
    const built = await world();
    await salesArea.run(built.ctx);
    for (const session of built.ctx.clientSessions.values()) {
      expect(built.gateway.clients.balanceOf(session.user.id)).toBeGreaterThanOrEqual(0);
      const mine = built.gateway.requests.filter((request) => request.email === session.user.email);
      const firstPurchase = mine.findIndex((request) => request.path.endsWith('/purchases'));
      const firstTopUp = mine.findIndex((request) => request.path.endsWith('/top-ups'));
      expect(firstTopUp).toBeGreaterThanOrEqual(0);
      expect(firstTopUp).toBeLessThan(firstPurchase);
    }
  });

  it('leaves a seat somebody else took as skipped and goes on', async () => {
    const built = await world();
    const planned = planSales(await built.tripsOnSale(), { today: TODAY });
    const target = planned.find((sale) => sale.channel === 'ONLINE')!;
    built.gateway.sales.occupy(target.trip.tripId, [target.seats[0]!]);
    const report = await salesArea.run(built.ctx);
    expect(report.counts['online tickets']?.skipped).toBe(1);
    expect(built.gateway.sales.tickets.some((t) => t.id === target.ticketId)).toBe(false);
  });

  it('waits for the account of a new client, which an event prepares', async () => {
    const built = await world();
    built.gateway.failNext(
      /POST \/api\/ventas\/purchases/,
      new GatewayError(
        409,
        'Estamos terminando de preparar tu cuenta. Intenta de nuevo en unos segundos.',
      ),
      3,
    );
    const report = await salesArea.run(built.ctx);
    expect(report.counts['online tickets']?.skipped).toBeUndefined();
  });

  it('settles a purchase in doubt once the wallet answers', async () => {
    const built = await world();
    built.gateway.sales.leaveNextPending(2);
    const report = await salesArea.run(built.ctx);
    expect(report.counts['online tickets']?.skipped).toBeUndefined();
    const planned = planSales(await built.tripsOnSale(), { today: TODAY });
    expect(report.counts['online tickets']?.created).toBe(
      planned.filter((sale) => sale.channel === 'ONLINE').length,
    );
  });

  it('counts a purchase that stays in doubt as skipped and does not charge again', async () => {
    const built = await world();
    built.gateway.sales.leaveNextPending(Infinity);
    const report = await salesArea.run(built.ctx);
    expect(report.counts['online tickets']?.skipped).toBe(1);
    later(built, 60);
    const again = await salesArea.run(built.ctx);
    expect(again.counts['online tickets']?.skipped).toBe(1);
    expect(built.gateway.count('POST', /\/purchases$/)).toBe(
      report.counts['online tickets']!.created + 1,
    );
  });

  it('does not sell again a purchase that failed before', async () => {
    const built = await world();
    const planned = planSales(await built.tripsOnSale(), { today: TODAY });
    const target = planned.find((sale) => sale.channel === 'ONLINE')!;
    const client = SEED_CLIENTS[(target.buyer as { number: number }).number - 1]!;
    const session = await clientSession(built.ctx, client);
    await expect(
      built.gateway.request(
        session,
        'POST',
        '/api/ventas/purchases',
        { tripId: target.trip.tripId, seats: target.seats, paidOn: TODAY },
        undefined,
        { 'Idempotency-Key': target.ticketId },
      ),
    ).rejects.toMatchObject({ status: 422 });
    const report = await salesArea.run(built.ctx);
    expect(report.counts['online tickets']?.skipped).toBe(1);
    expect(built.gateway.sales.tickets.some((t) => t.id === target.ticketId)).toBe(false);
  });

  it('puts counter sales made with the NIT of a client in that client history', async () => {
    const built = await world();
    await salesArea.run(built.ctx);
    const linked = built.gateway.sales.tickets.filter(
      (ticket) => ticket.channel === 'COUNTER' && ticket.clientId,
    );
    expect(linked.length).toBeGreaterThan(0);
    const owner = [...built.ctx.clientSessions.values()].find(
      (session) => session.user.id === linked[0]?.clientId,
    );
    expect(owner).toBeDefined();
    const history = await built.gateway.request<{ items: { id: string }[] }>(
      owner!,
      'GET',
      '/api/ventas/tickets',
    );
    expect(history.items.map((ticket) => ticket.id)).toContain(linked[0]?.id);
  });

  it('dates the payments within the past 14 days', async () => {
    const built = await world();
    await salesArea.run(built.ctx);
    const paid = built.gateway.sales.tickets.map((ticket) => String(ticket.paidOn));
    expect(paid.every((day) => day <= TODAY && day >= addDays(TODAY, -13))).toBe(true);
    expect(new Set(paid).size).toBeGreaterThan(5);
  });

  it('gives a walk-in buyer an email on a few sales', async () => {
    const built = await world();
    await salesArea.run(built.ctx);
    const withEmail = built.gateway.requests.filter(
      (request) =>
        request.path.endsWith('/counter/tickets') &&
        (request.body as { email?: string }).email === 'seed+ventanilla@debus.local',
    );
    expect(withEmail.length).toBeGreaterThan(0);
  });

  it('sells nothing when there are no days far enough ahead, and says so', async () => {
    const built = await world();
    const log = jest.fn();
    built.ctx.log = log;
    built.ctx.daysAhead = SALE_FROM_DAYS_AHEAD - 1;
    const report = await salesArea.run(built.ctx);
    expect(report.counts).toEqual({});
    expect(built.gateway.sales.tickets).toHaveLength(0);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('days'));
  });

  it('reports the top-ups that a purchase needed', async () => {
    const built = await world();
    const report = await salesArea.run(built.ctx);
    expect(report.counts['top-ups']?.created).toBeGreaterThan(0);
    later(built, 60);
    const again = await salesArea.run(built.ctx);
    expect(again.counts['top-ups']?.created ?? 0).toBe(0);
  });

  it('says which area to run first when there are no trips to sell', async () => {
    const built = await world();
    built.gateway.trips.length = 0;
    const log = jest.fn();
    built.ctx.log = log;
    const report = await salesArea.run(built.ctx);
    expect(report.counts).toEqual({});
    expect(log).toHaveBeenCalledWith(expect.stringContaining('operations'));
  });
});
