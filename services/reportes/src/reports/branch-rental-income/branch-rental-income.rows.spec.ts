import { toRentalIncomeRow, toRentalIncomeTotals } from './branch-rental-income.rows';

describe('rental income rows', () => {
  const record = {
    id: '1f0e2d3c-4b5a-4968-8776-655443322110',
    client_name: 'Colegio San José',
    nit: '1234567-8',
    origin_label: 'Quetzaltenango',
    destination_label: 'Panajachel',
    departure_at: new Date('2026-10-24T13:00:00.000Z'),
    return_at: new Date('2026-10-24T23:00:00.000Z') as Date | null,
    paid_on: new Date('2026-10-21T00:00:00.000Z'),
    passengers: 35,
    bus_plate: 'C482BTX' as string | null,
    price: 2760,
  };

  it('maps a raw row to the contract row with ISO instants and the paid day', () => {
    expect(toRentalIncomeRow(record)).toEqual({
      rentalId: record.id,
      clientName: 'Colegio San José',
      nit: '1234567-8',
      originLabel: 'Quetzaltenango',
      destinationLabel: 'Panajachel',
      departureAt: '2026-10-24T13:00:00.000Z',
      returnAt: '2026-10-24T23:00:00.000Z',
      paidOn: '2026-10-21',
      passengers: 35,
      busPlate: 'C482BTX',
      price: 2760,
    });
  });

  it('keeps a one-way return and an unassigned bus as null', () => {
    expect(toRentalIncomeRow({ ...record, return_at: null, bus_plate: null })).toMatchObject({
      returnAt: null,
      busPlate: null,
    });
  });

  it('turns the totals into zeros when nothing matched', () => {
    expect(toRentalIncomeTotals(undefined)).toEqual({ rentals: 0, income: 0 });
    expect(toRentalIncomeTotals({ rentals: 2, income: 4260 })).toEqual({
      rentals: 2,
      income: 4260,
    });
  });
});
