import { randomUUID } from 'node:crypto';
import { TEST_BRANCH_PREFIX, TEST_RUN } from '@debus/config/test-data';
import {
  exampleBranch,
  exampleBus,
  exampleCounterTicketSold,
  exampleRentalCancelled,
  exampleRentalPaid,
  exampleRepairExpenseAdded,
  exampleTicketSold,
  exampleTripCompleted,
  exampleTripDeleted,
  exampleTripScheduled,
} from '@debus/contracts';
import type { InMemoryEventBus } from '@debus/messaging';

// All the data sits in March 2031, so a query over WINDOW sees only what a test created even when
// the local database already holds real reports.
// The route of every ticket and trip of the fixture.
export const ROUTE_ID = randomUUID();

export const WINDOW = { from: '2031-03-01', to: '2031-03-31' };

export interface FixtureBranch {
  id: string;
  name: string;
  busId: string;
  plate: string;
}

export interface SystemFinanceFixture {
  angeles: FixtureBranch;
  boca: FixtureBranch;
  // The id of the first trip of Ángeles: it arrived at 23:30 of 12 March in Guatemala, which is
  // already the 13th in UTC.
  borderTripId: string;
  repairExpenseId: string;
  rentalId: string;
}

export const addBranch = async (
  bus: InMemoryEventBus,
  label: string,
  active = true,
): Promise<{ id: string; name: string }> => {
  const id = randomUUID();
  const name = `${TEST_BRANCH_PREFIX}${TEST_RUN} ${label}`;
  await bus.deliver('BranchCreated', { ...exampleBranch, branchId: id, code: 'TST', name, active });
  return { id, name };
};

const addBus = async (bus: InMemoryEventBus, branchId: string, plate: string) => {
  const busId = randomUUID();
  await bus.deliver('BusAdded', { ...exampleBus, busId, branchId, plate });
  return busId;
};

export interface SaleOptions {
  channel: 'ONLINE' | 'COUNTER';
  branch: FixtureBranch;
  tripId: string;
  seats: number;
  unitPrice: number;
  paidOn: string;
  // The route and the place the tickets go to; the fixture route to Guatemala by default.
  routeId?: string;
  destination?: string;
}
export const sellTickets = (
  bus: InMemoryEventBus,
  {
    channel,
    branch,
    tripId,
    seats,
    unitPrice,
    paidOn,
    routeId = ROUTE_ID,
    destination = 'Guatemala',
  }: SaleOptions,
) =>
  bus.deliver('TicketSold', {
    ...(channel === 'ONLINE' ? exampleTicketSold : exampleCounterTicketSold),
    ticketId: randomUUID(),
    tripId,
    routeId,
    branchId: branch.id,
    busId: branch.busId,
    originLabel: 'Quetzaltenango',
    destinationLabel: destination,
    seats: Array.from({ length: seats }, (_, index) => index + 1),
    unitPrice,
    total: unitPrice * seats,
    paidOn,
  });

const completeTrip = async (
  bus: InMemoryEventBus,
  branch: FixtureBranch,
  tripId: string,
  figures: { arrivedAt: string; fuelCost: number; depreciationAmount: number },
) => {
  const ids = { tripId, branchId: branch.id, busId: branch.busId, routeId: ROUTE_ID };
  await bus.deliver('TripScheduled', {
    ...exampleTripScheduled,
    ...ids,
    busPlate: branch.plate,
    originLabel: 'Quetzaltenango',
    destinationLabel: 'Guatemala',
  });
  await bus.deliver('TripCompleted', { ...exampleTripCompleted, ...ids, ...figures });
};

// Two branches with the cases the system reports must get right.
//
// Ángeles: an online ticket (Q 170), a counter ticket (Q 85), a paid rental (Q 2,760), a rental
// cancelled after it was paid and one cancelled before, a sale of a deleted trip (before and after
// the deletion), two completed trips (fuel Q 1,180 and depreciation Q 306; no fuel and Q 150) and
// a repair of Q 350.50 in labor and Q 5,200 in parts.
// Boca: a counter sale (Q 850), a completed trip (fuel Q 400, depreciation Q 100) and a repair of
// Q 300 in parts.
export async function seedSystemFinance(bus: InMemoryEventBus): Promise<SystemFinanceFixture> {
  const a = await addBranch(bus, 'Ángeles finanzas');
  const b = await addBranch(bus, 'Boca finanzas');
  const angeles: FixtureBranch = {
    ...a,
    busId: await addBus(bus, a.id, 'P111AAA'),
    plate: 'P111AAA',
  };
  const boca: FixtureBranch = { ...b, busId: await addBus(bus, b.id, 'P222BBB'), plate: 'P222BBB' };

  const borderTripId = randomUUID();
  await sellTickets(bus, {
    channel: 'ONLINE',
    branch: angeles,
    tripId: borderTripId,
    seats: 2,
    unitPrice: 85,
    paidOn: '2031-03-10',
  });
  await sellTickets(bus, {
    channel: 'COUNTER',
    branch: angeles,
    tripId: borderTripId,
    seats: 1,
    unitPrice: 85,
    paidOn: '2031-03-12',
  });
  await completeTrip(bus, angeles, borderTripId, {
    arrivedAt: '2031-03-13T05:30:00.000Z',
    fuelCost: 1180,
    depreciationAmount: 306,
  });
  await completeTrip(bus, angeles, randomUUID(), {
    arrivedAt: '2031-03-20T15:00:00.000Z',
    fuelCost: 0,
    depreciationAmount: 150,
  });

  const rentalId = randomUUID();
  const rental = { ...exampleRentalPaid, branchId: angeles.id, paidOn: '2031-03-11' };
  await bus.deliver('RentalPaid', { ...rental, rentalId });
  const cancelledAfter = randomUUID();
  await bus.deliver('RentalPaid', { ...rental, rentalId: cancelledAfter, price: 500 });
  await bus.deliver('RentalCancelled', {
    ...exampleRentalCancelled,
    rentalId: cancelledAfter,
    branchId: angeles.id,
  });
  const cancelledBefore = randomUUID();
  await bus.deliver('RentalCancelled', {
    ...exampleRentalCancelled,
    rentalId: cancelledBefore,
    branchId: angeles.id,
  });
  await bus.deliver('RentalPaid', { ...rental, rentalId: cancelledBefore, price: 900 });

  const refundedBefore = randomUUID();
  const refundedAfter = randomUUID();
  await sellTickets(bus, {
    channel: 'ONLINE',
    branch: angeles,
    tripId: refundedBefore,
    seats: 1,
    unitPrice: 85,
    paidOn: '2031-03-11',
  });
  await bus.deliver('TripDeleted', {
    ...exampleTripDeleted,
    tripId: refundedBefore,
    branchId: angeles.id,
    busId: angeles.busId,
  });
  await bus.deliver('TripDeleted', {
    ...exampleTripDeleted,
    tripId: refundedAfter,
    branchId: angeles.id,
    busId: angeles.busId,
  });
  await sellTickets(bus, {
    channel: 'ONLINE',
    branch: angeles,
    tripId: refundedAfter,
    seats: 1,
    unitPrice: 85,
    paidOn: '2031-03-11',
  });

  const repairExpenseId = randomUUID();
  const [parts, labor] = exampleRepairExpenseAdded.lines;
  await bus.deliver('RepairExpenseAdded', {
    ...exampleRepairExpenseAdded,
    expenseId: repairExpenseId,
    branchId: angeles.id,
    busId: angeles.busId,
    serviceDate: '2031-03-14',
    total: 5550.5,
    lines: [
      { ...parts!, amount: 5200 },
      { ...labor!, amount: 350.5 },
    ],
  });

  await sellTickets(bus, {
    channel: 'COUNTER',
    branch: boca,
    tripId: randomUUID(),
    seats: 10,
    unitPrice: 85,
    paidOn: '2031-03-10',
  });
  await completeTrip(bus, boca, randomUUID(), {
    arrivedAt: '2031-03-15T15:00:00.000Z',
    fuelCost: 400,
    depreciationAmount: 100,
  });
  await bus.deliver('RepairExpenseAdded', {
    ...exampleRepairExpenseAdded,
    expenseId: randomUUID(),
    branchId: boca.id,
    busId: boca.busId,
    serviceDate: '2031-03-15',
    total: 300,
    lines: [{ ...parts!, amount: 300 }],
  });

  return { angeles, boca, borderTripId, repairExpenseId, rentalId };
}
