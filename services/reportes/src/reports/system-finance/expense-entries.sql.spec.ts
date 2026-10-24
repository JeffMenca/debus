import { expenseEntries } from './expense-entries.sql';

describe('expenseEntries', () => {
  it('has fuel, depreciation and the repair lines, and no driver pay', () => {
    const { sql } = expenseEntries({});

    expect(sql).toContain("'FUEL'");
    expect(sql).toContain("'DEPRECIATION'");
    expect(sql).toContain('FROM branch_report_repair_lines');
    expect(sql).not.toMatch(/driver/i);
  });

  it('only counts completed trips that were not deleted and amounts above zero', () => {
    const { sql } = expenseEntries({});

    expect(sql).toContain('t.arrived_at IS NOT NULL AND t.deleted_at IS NULL');
    expect(sql).toContain('t.fuel_cost > 0');
    expect(sql).toContain('t.depreciation_amount > 0');
    expect(sql).toContain('l.amount > 0');
  });

  it('dates trips by the Guatemalan day of the arrival and repairs by the service day', () => {
    const { sql, values } = expenseEntries({
      from: '2026-10-01',
      to: '2026-10-31',
      branchId: '9b2c7a10-1111-4c4c-8888-123456789abc',
    });

    expect(sql).toContain("AT TIME ZONE 'America/Guatemala'");
    expect(sql).toContain('t.arrived_at >= ');
    expect(sql).toContain('t.arrived_at < ');
    expect(sql).toContain('l.service_date >= ');
    expect(sql).toContain('l.service_date <= ');
    expect(values.filter((value) => value instanceof Date)).toHaveLength(4);
  });
});
