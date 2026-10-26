import { SEED_CLIENTS } from '../clients-catalog';
import { setup } from '../testing/setup';
import { clientsArea } from './clients';

const PLANNED_TOP_UPS = SEED_CLIENTS.reduce((sum, client) => sum + client.topUps.length, 0);

describe('clientsArea', () => {
  it('belongs to the sales and clients team', () => {
    expect(clientsArea).toMatchObject({ name: 'clients', owner: 'roberto' });
  });

  it('activates every client and makes their top-ups', async () => {
    const { gateway, ctx } = setup();
    const report = await clientsArea.run(ctx);
    expect(report.counts.accounts).toEqual({ created: 12, existing: 0 });
    expect(report.counts['top-ups']).toEqual({ created: PLANNED_TOP_UPS, existing: 0 });
    expect(gateway.users.filter((user) => user.role === 'CLIENT')).toHaveLength(12);
    expect(ctx.clientSessions.size).toBe(12);
  });

  it('creates nothing the second time and the balances do not move', async () => {
    const { gateway, ctx } = setup();
    await clientsArea.run(ctx);
    const balances = SEED_CLIENTS.map((client) =>
      gateway.clients.balanceOf(ctx.clientSessions.get(client.number)!.user.id),
    );
    gateway.requests.length = 0;
    ctx.clientSessions.clear();

    const report = await clientsArea.run(ctx);
    expect(report.counts.accounts).toEqual({ created: 0, existing: 12 });
    expect(report.counts['top-ups']).toEqual({ created: 0, existing: PLANNED_TOP_UPS });
    expect(gateway.count('POST', /signup|top-ups/)).toBe(0);
    expect(
      SEED_CLIENTS.map((client) =>
        gateway.clients.balanceOf(ctx.clientSessions.get(client.number)!.user.id),
      ),
    ).toEqual(balances);
  });

  it('gives every client the amounts of the catalog', async () => {
    const { gateway, ctx } = setup();
    await clientsArea.run(ctx);
    for (const client of SEED_CLIENTS) {
      const total = client.topUps.reduce((sum, amount) => sum + amount, 0);
      expect(gateway.clients.balanceOf(ctx.clientSessions.get(client.number)!.user.id)).toBe(total);
    }
  });
});
