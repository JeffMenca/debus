import {
  EXPENSE_CONCEPT_LABELS,
  expenseDetail,
  toExpenseRow,
  toExpenseTotals,
} from './system-expenses.rows';

describe('system expense rows', () => {
  const trip = {
    id: '1f0e2d3c-4b5a-4968-8776-655443322110:FUEL',
    branch_id: '9b2c7a10-1111-4c4c-8888-123456789abc',
    branch_name: 'Quetzaltenango',
    concept: 'FUEL',
    day: new Date('2026-10-20T00:00:00.000Z'),
    bus_plate: 'C482BTX' as string | null,
    origin_label: 'Quetzaltenango' as string | null,
    destination_label: 'Guatemala' as string | null,
    category_name: null as string | null,
    description: null as string | null,
    amount: 1250,
  };

  it('labels every concept in plain Spanish', () => {
    expect(EXPENSE_CONCEPT_LABELS).toEqual({
      FUEL: 'Combustible',
      DEPRECIATION: 'Depreciación',
      LABOR: 'Mano de obra',
      PART: 'Repuestos',
    });
  });

  it('maps a raw fuel row to the contract row with its day', () => {
    expect(toExpenseRow(trip)).toEqual({
      id: trip.id,
      branchId: trip.branch_id,
      branchName: 'Quetzaltenango',
      concept: 'FUEL',
      day: '2026-10-20',
      busPlate: 'C482BTX',
      originLabel: 'Quetzaltenango',
      destinationLabel: 'Guatemala',
      categoryName: null,
      description: null,
      amount: 1250,
    });
  });

  it('keeps the category and the description of a repair line', () => {
    expect(
      toExpenseRow({
        ...trip,
        concept: 'PART',
        origin_label: null,
        destination_label: null,
        category_name: 'Llantas',
        description: 'Dos llantas',
      }),
    ).toMatchObject({ concept: 'PART', categoryName: 'Llantas', description: 'Dos llantas' });
  });

  it('details a trip by its route and a repair line by its category and description', () => {
    expect(expenseDetail(toExpenseRow(trip))).toBe('Quetzaltenango – Guatemala');
    expect(
      expenseDetail(
        toExpenseRow({
          ...trip,
          concept: 'LABOR',
          origin_label: null,
          destination_label: null,
          category_name: 'Llantas',
          description: 'Cambio',
        }),
      ),
    ).toBe('Llantas: Cambio');
    expect(
      expenseDetail(toExpenseRow({ ...trip, origin_label: null, destination_label: null })),
    ).toBe('');
  });

  it('turns the totals into zeros when nothing matched', () => {
    expect(toExpenseTotals(undefined)).toEqual({
      entries: 0,
      amount: 0,
      fuel: 0,
      depreciation: 0,
      labor: 0,
      parts: 0,
    });
    expect(
      toExpenseTotals({
        entries: 4,
        amount: 4250.5,
        fuel: 1250,
        depreciation: 303,
        labor: 450,
        parts: 2247.5,
      }),
    ).toEqual({
      entries: 4,
      amount: 4250.5,
      fuel: 1250,
      depreciation: 303,
      labor: 450,
      parts: 2247.5,
    });
  });
});
