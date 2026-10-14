import { exampleRentalPaid, rentalRequestSchema } from '@debus/contracts';
import { Prisma } from '../generated/prisma/client';
import { toRentalRequest } from './rental-mappers';

const row = {
  id: exampleRentalPaid.rentalId,
  branchId: exampleRentalPaid.branchId,
  clientName: 'Colegio San José',
  nit: '1234567-8',
  originLabel: 'Quetzaltenango',
  destinationLabel: 'Panajachel',
  departureAt: new Date(exampleRentalPaid.departureAt),
  returnAt: new Date(exampleRentalPaid.returnAt ?? ''),
  passengers: 35,
  distanceKm: new Prisma.Decimal('92.0'),
  price: new Prisma.Decimal('2760.00'),
  status: 'PENDING' as const,
  tripId: null,
  searchText: 'ignored',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('toRentalRequest', () => {
  it('shows a rental with plain numbers and ISO instants', () => {
    expect(rentalRequestSchema.parse(toRentalRequest(row))).toEqual({
      id: row.id,
      branchId: row.branchId,
      clientName: 'Colegio San José',
      nit: '1234567-8',
      originLabel: 'Quetzaltenango',
      destinationLabel: 'Panajachel',
      departureAt: '2026-10-24T13:00:00.000Z',
      returnAt: '2026-10-24T23:00:00.000Z',
      passengers: 35,
      distanceKm: 92,
      price: 2760,
      status: 'PENDING',
      tripId: null,
    });
  });

  it('keeps a one-way rental without return and shows the trip it was given', () => {
    const shown = toRentalRequest({
      ...row,
      returnAt: null,
      status: 'ASSIGNED',
      tripId: exampleRentalPaid.rentalId,
    });

    expect(shown).toMatchObject({
      returnAt: null,
      status: 'ASSIGNED',
      tripId: exampleRentalPaid.rentalId,
    });
  });
});
