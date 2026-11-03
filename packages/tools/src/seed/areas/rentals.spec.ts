import { addDays } from '../dates';
import { GatewayError } from '../gateway-client';
import { NOW, TODAY } from '../testing/setup';
import { readyWorld } from '../testing/world';
import { SEED_RENTALS, type RentalTarget } from './rental-catalog';
import { rentalsArea } from './rentals';

const world = () => readyWorld();
type World = Awaited<ReturnType<typeof world>>;

const later = (built: World, seconds: number) => {
  const at = new Date(NOW.getTime() + seconds * 1000);
  built.gateway.now = () => at;
  built.ctx.now = () => at;
};

const rentalsOf = (built: World) => built.gateway.rentals.all();
const statusOf = (built: World, id: string) => built.gateway.rentals.requestStatus(id);
const labelFor = (target: RentalTarget) =>
  SEED_RENTALS.filter((rental) => rental.target === target);

describe('rentalsArea', () => {
  it('belongs to the sales and clients team', () => {
    expect(rentalsArea).toMatchObject({ name: 'rentals', owner: 'roberto' });
  });

  it('takes every rental as far as its target', async () => {
    const built = await world();
    const report = await rentalsArea.run(built.ctx);
    expect(report.counts.rentals).toEqual({ created: 10, existing: 0 });
    expect(report.counts['top-ups']?.created).toBeGreaterThan(0);
    const byDestination = (destination: string) =>
      rentalsOf(built).find((rental) => rental.destinationLabel === destination)!;
    expect(byDestination('Lago de Atitlán').status).toBe('REQUESTED');
    expect(byDestination('Retalhuleu').status).toBe('CONFIRMED');
    expect(byDestination('Volcán de Pacaya').status).toBe('PAID');
    expect(statusOf(built, byDestination('Volcán de Pacaya').id)).toBe('PENDING');
    expect(statusOf(built, byDestination('Semuc Champey').id)).toBe('ASSIGNED');
    expect(byDestination('Parque Nacional Tikal').status).toBe('CANCELLED');
    expect(statusOf(built, byDestination('Parque Nacional Tikal').id)).toBe('CANCELLED');
    expect(byDestination('Chichicastenango').status).toBe('CANCELLED');
    expect(byDestination('Chichicastenango').paidOn).toBeNull();
    expect(byDestination('Aeropuerto La Aurora').status).toBe('CONFIRMED');
    expect(rentalsOf(built).filter((rental) => rental.channel === 'COUNTER')).toHaveLength(3);
  });

  it('gives a bus and a driver to the rentals that should have one', async () => {
    const built = await world();
    await rentalsArea.run(built.ctx);
    const trips = built.gateway.trips.filter((trip) => trip.type === 'RENTAL');
    expect(trips).toHaveLength(labelFor('ASSIGNED').length);
    for (const trip of trips) {
      expect(trip.busId).toBeTruthy();
      expect(Date.parse(String(trip.estimatedArrivalAt))).toBeGreaterThan(
        Date.parse(String(trip.departureAt)),
      );
    }
  });

  it('pays every paid rental from the wallet of its client', async () => {
    const built = await world();
    await rentalsArea.run(built.ctx);
    const counter = rentalsOf(built).filter((rental) => rental.channel === 'COUNTER');

    expect(counter.every((rental) => rental.clientId)).toBe(true);
    const paid = counter.filter((rental) => rental.status === 'PAID');
    expect(paid.length).toBeGreaterThan(0);
    for (const rental of paid) {
      const movements = await built.gateway.request<{ items: { reference: string | null }[] }>(
        [...built.ctx.clientSessions.values()].find((s) => s.user.id === rental.clientId)!,
        'GET',
        '/api/clientes/wallet/movements',
      );
      expect(movements.items.map((movement) => movement.reference)).toContain(rental.id);
    }
  });

  it('pays online rentals from the wallet and gives the money back for the cancelled one', async () => {
    const built = await world();
    await rentalsArea.run(built.ctx);
    const tikal = rentalsOf(built).find(
      (rental) => rental.destinationLabel === 'Parque Nacional Tikal',
    )!;
    const movements = await built.gateway.request<{ items: { kind: string; amount: number }[] }>(
      [...built.ctx.clientSessions.values()].find((s) => s.user.id === tikal.clientId)!,
      'GET',
      '/api/clientes/wallet/movements',
    );
    expect(movements.items.map((movement) => movement.kind)).toEqual([
      'REFUND',
      'RENTAL',
      'TOP_UP',
    ]);
    expect(movements.items[0]!.amount).toBe(-movements.items[1]!.amount);
    for (const session of built.ctx.clientSessions.values()) {
      expect(built.gateway.clients.balanceOf(session.user.id)).toBeGreaterThanOrEqual(0);
    }
  });

  it('dates the payments within the past 14 days', async () => {
    const built = await world();
    await rentalsArea.run(built.ctx);
    const paid = rentalsOf(built)
      .filter((rental) => rental.paidOn)
      .map((rental) => String(rental.paidOn));
    expect(paid.length).toBe(6);
    expect(paid.every((day) => day <= TODAY && day >= addDays(TODAY, -13))).toBe(true);
  });

  it('leaves later than the regular trips', async () => {
    const built = await world();
    await rentalsArea.run(built.ctx);
    for (const rental of rentalsOf(built)) {
      expect(String(rental.departureAt).slice(0, 10) > addDays(TODAY, 7)).toBe(true);
    }
  });

  it('does nothing the second time, not even on a later day', async () => {
    const built = await world();
    await rentalsArea.run(built.ctx);
    const before = JSON.stringify([rentalsOf(built), built.gateway.trips.length]);
    const balances = [...built.ctx.clientSessions.values()].map((s) =>
      built.gateway.clients.balanceOf(s.user.id),
    );
    built.ctx.today = addDays(TODAY, 3);
    later(built, 3 * 86_400);
    built.gateway.requests.length = 0;
    const report = await rentalsArea.run(built.ctx);
    expect(report.counts.rentals).toEqual({ created: 0, existing: 10 });
    expect(
      built.gateway.requests.filter(
        (r) => r.method === 'POST' && !/signup|auth|top-ups/.test(r.path),
      ),
    ).toHaveLength(0);
    expect(JSON.stringify([rentalsOf(built), built.gateway.trips.length])).toBe(before);
    expect(
      [...built.ctx.clientSessions.values()].map((s) => built.gateway.clients.balanceOf(s.user.id)),
    ).toEqual(balances);
  });

  it('picks up a rental that was paid but never assigned, when the run stopped there', async () => {
    const built = await world();
    built.gateway.failNext(
      /POST \/api\/viajes\/rental-requests\/[^/]+\/assignment/,
      new GatewayError(500, 'Se cortó.'),
      1,
    );
    await expect(rentalsArea.run(built.ctx)).rejects.toMatchObject({ status: 500 });
    const stuck = rentalsOf(built).filter((rental) => rental.destinationLabel === 'Semuc Champey');
    expect(stuck[0]!.status).toBe('PAID');
    expect(statusOf(built, stuck[0]!.id)).toBe('PENDING');
    built.ctx.clientSessions.clear();
    const report = await rentalsArea.run(built.ctx);
    expect(statusOf(built, stuck[0]!.id)).not.toBe('PENDING');
    expect(report.counts.rentals?.existing).toBeGreaterThan(0);
    expect(built.gateway.trips.filter((trip) => trip.type === 'RENTAL')).toHaveLength(
      labelFor('ASSIGNED').length,
    );
  });

  it('tries the next bus when one is busy', async () => {
    const built = await world();
    const first = built.gateway.buses.find(
      (bus) => bus.branchId === built.ctx.branchIds.get('COB'),
    )!;
    const target = SEED_RENTALS.find((rental) => rental.key === 'semuc-familia')!;
    const day = addDays(TODAY, target.daysAhead);
    built.gateway.trips.push({
      id: 'busy',
      type: 'REGULAR',
      status: 'SCHEDULED',
      branchId: first.branchId,
      busId: first.id,
      driverId: 'someone',
      departureAt: `${day}T00:00:00.000Z`,
      estimatedArrivalAt: `${addDays(day, 2)}T00:00:00.000Z`,
    });
    await rentalsArea.run(built.ctx);
    const trip = built.gateway.trips.find(
      (candidate) => candidate.type === 'RENTAL' && candidate.destinationName === 'Semuc Champey',
    );
    expect(trip?.busId).not.toBe(first.id);
  });

  it('leaves a rental unassigned, and says so, when no bus is free', async () => {
    const built = await world();
    const log = jest.fn();
    built.ctx.log = log;
    for (const bus of built.gateway.buses) {
      built.gateway.trips.push({
        id: `busy-${bus.id}`,
        type: 'REGULAR',
        status: 'SCHEDULED',
        branchId: bus.branchId,
        busId: bus.id,
        driverId: `none-${bus.id}`,
        departureAt: `${addDays(TODAY, 8)}T00:00:00.000Z`,
        estimatedArrivalAt: `${addDays(TODAY, 40)}T00:00:00.000Z`,
      });
    }
    const report = await rentalsArea.run(built.ctx);
    expect(report.counts.assignments?.skipped).toBe(labelFor('ASSIGNED').length + 1);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('No bus'));
  });

  it('waits for the payment to reach viajes before assigning', async () => {
    const built = await world();
    built.gateway.failNext(
      /POST \/api\/viajes\/rental-requests\/[^/]+\/cancel/,
      new GatewayError(
        404,
        'Todavía estamos registrando el pago de este alquiler. Intenta en un momento.',
      ),
      2,
    );
    const report = await rentalsArea.run(built.ctx);
    expect(report.counts.cancellations?.created).toBe(2);
    const tikal = rentalsOf(built).find(
      (rental) => rental.destinationLabel === 'Parque Nacional Tikal',
    )!;
    expect(statusOf(built, tikal.id)).toBe('CANCELLED');
  });

  it('does not cancel again a rental that viajes already cancelled while clientes still shows it paid', async () => {
    const built = await world();
    await rentalsArea.run(built.ctx);
    const tikal = rentalsOf(built).find(
      (rental) => rental.destinationLabel === 'Parque Nacional Tikal',
    )!;
    tikal.status = 'PAID';
    built.gateway.requests.length = 0;
    await rentalsArea.run(built.ctx);
    expect(built.gateway.count('POST', /rental-requests\/[^/]+\/cancel$/)).toBe(0);
  });
});
