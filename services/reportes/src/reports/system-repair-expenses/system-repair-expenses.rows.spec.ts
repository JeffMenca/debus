import {
  REPAIR_KIND_LABELS,
  toCategoryGroups,
  toRepairRow,
  toRepairTotals,
} from './system-repair-expenses.rows';

describe('system repair expense rows', () => {
  const record = {
    expense_id: '5d4e3f2a-8b7c-4d6e-9f0a-1b2c3d4e5f6a',
    line_no: 0,
    category_id: '6e5f4a3b-9c8d-4e7f-8a0b-2c3d4e5f6a7b',
    category_name: 'Llantas',
    bus_id: '1f0e2d3c-4b5a-4968-8776-655443322110',
    bus_plate: 'P111AAA' as string | null,
    branch_id: '9b2c7a10-1111-4c4c-8888-123456789abc',
    branch_name: 'Quetzaltenango',
    // A DATE column reaches us as midnight UTC of that day.
    service_date: new Date('2026-10-15T00:00:00.000Z'),
    kind: 'PART',
    description: 'Dos llantas delanteras',
    amount: 2400,
  };

  it('labels each kind of line in plain Spanish', () => {
    expect(REPAIR_KIND_LABELS).toEqual({ LABOR: 'Mano de obra', PART: 'Repuestos' });
  });

  it('maps a raw line to the contract row with the service day', () => {
    expect(toRepairRow(record)).toEqual({
      expenseId: record.expense_id,
      lineNo: 0,
      categoryId: record.category_id,
      categoryName: 'Llantas',
      busId: record.bus_id,
      busPlate: 'P111AAA',
      branchId: record.branch_id,
      branchName: 'Quetzaltenango',
      serviceDate: '2026-10-15',
      kind: 'PART',
      description: 'Dos llantas delanteras',
      amount: 2400,
    });
  });

  it('keeps a bus the read model does not know as a null plate', () => {
    expect(toRepairRow({ ...record, bus_plate: null }).busPlate).toBeNull();
  });

  it('maps the categories and turns the totals into zeros when nothing matched', () => {
    expect(
      toCategoryGroups([
        { category_id: record.category_id, category_name: 'Llantas', lines: 2, amount: 2700 },
      ]),
    ).toEqual([
      { categoryId: record.category_id, categoryName: 'Llantas', lines: 2, amount: 2700 },
    ]);
    expect(toRepairTotals(undefined)).toEqual({ lines: 0, expenses: 0, amount: 0 });
    expect(toRepairTotals({ lines: 3, expenses: 2, amount: 2850 })).toEqual({
      lines: 3,
      expenses: 2,
      amount: 2850,
    });
  });
});
