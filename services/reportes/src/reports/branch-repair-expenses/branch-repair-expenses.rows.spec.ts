import { nestCategories, toRepairGroups, toRepairTotals } from './branch-repair-expenses.rows';

describe('repair expense rows', () => {
  const bus1 = '1f0e2d3c-4b5a-4968-8776-655443322110';
  const bus2 = '2f0e2d3c-4b5a-4968-8776-655443322110';
  const motor = 'a1000000-4b5a-4968-8776-655443322110';
  const tires = 'a2000000-4b5a-4968-8776-655443322110';
  const brakes = 'a3000000-4b5a-4968-8776-655443322110';
  const buses = [
    { id: bus1, plate: 'C482BTX', brand: 'Volvo', model: 'B8R', expenses: 2, total: 2300 },
    { id: bus2, plate: null, brand: null, model: null, expenses: 1, total: 450 },
    {
      id: 'c0000000-4b5a-4968-8776-655443322110',
      plate: 'C1',
      brand: 'Hino',
      model: 'RK8',
      expenses: 0,
      total: 0,
    },
  ];

  it('gives every bus its categories by amount, the biggest first', () => {
    const rows = nestCategories(buses, [
      { bus_id: bus1, category_id: tires, category_name: 'Llantas', lines: 1, amount: 800 },
      { bus_id: bus2, category_id: brakes, category_name: 'Frenos', lines: 1, amount: 450 },
      { bus_id: bus1, category_id: motor, category_name: 'Motor', lines: 2, amount: 1500 },
    ]);

    expect(rows[0]?.categories).toEqual([
      { categoryId: motor, categoryName: 'Motor', lines: 2, amount: 1500 },
      { categoryId: tires, categoryName: 'Llantas', lines: 1, amount: 800 },
    ]);
    expect(rows[1]?.categories).toEqual([
      { categoryId: brakes, categoryName: 'Frenos', lines: 1, amount: 450 },
    ]);
  });

  it('breaks a tie of amounts by the name of the category', () => {
    const [row] = nestCategories(buses.slice(0, 1), [
      { bus_id: bus1, category_id: tires, category_name: 'Llantas', lines: 1, amount: 500 },
      { bus_id: bus1, category_id: motor, category_name: 'Motor', lines: 1, amount: 500 },
      { bus_id: bus1, category_id: brakes, category_name: 'Frenos', lines: 1, amount: 500 },
    ]);

    expect(row?.categories.map((c) => c.categoryName)).toEqual(['Frenos', 'Llantas', 'Motor']);
  });

  it('leaves a bus without categories with an empty list', () => {
    const rows = nestCategories(buses, []);

    expect(rows.map((row) => row.categories)).toEqual([[], [], []]);
  });

  it('keeps the bus data, with empty names for a bus the read model does not know', () => {
    const rows = nestCategories(buses, []);

    expect(rows[0]).toEqual({
      busId: bus1,
      plate: 'C482BTX',
      brand: 'Volvo',
      model: 'B8R',
      expenses: 2,
      total: 2300,
      categories: [],
    });
    expect(rows[1]).toMatchObject({ busId: bus2, plate: null, brand: null, model: null });
  });

  it('adds up to the total of the bus', () => {
    const [row] = nestCategories(buses.slice(0, 1), [
      { bus_id: bus1, category_id: tires, category_name: 'Llantas', lines: 1, amount: 800 },
      { bus_id: bus1, category_id: motor, category_name: 'Motor', lines: 2, amount: 1500 },
    ]);

    expect(row?.categories.reduce((sum, c) => sum + c.amount, 0)).toBe(row?.total);
  });

  it('reads the totals of the filtered set, or zeros when nothing matched', () => {
    expect(toRepairTotals({ buses: 2, expenses: 3, total: 2750 })).toEqual({
      buses: 2,
      expenses: 3,
      total: 2750,
    });
    expect(toRepairTotals(undefined)).toEqual({ buses: 0, expenses: 0, total: 0 });
  });

  it('reads the totals by category as the groups', () => {
    expect(
      toRepairGroups([{ category_id: motor, category_name: 'Motor', lines: 3, amount: 1500 }]),
    ).toEqual([{ categoryId: motor, categoryName: 'Motor', lines: 3, amount: 1500 }]);
    expect(toRepairGroups([])).toEqual([]);
  });
});
