import { incomeEntries } from './income-entries.sql';

describe('incomeEntries', () => {
  it('joins the tickets and the rentals and leaves out refunded trips and cancelled rentals', () => {
    const { sql } = incomeEntries({});

    expect(sql).toContain('FROM branch_report_ticket_sales');
    expect(sql).toContain('UNION ALL');
    expect(sql).toContain('FROM branch_report_rentals');
    expect(sql).toContain('t.deleted_at IS NOT NULL');
    expect(sql).toContain('FROM branch_report_rental_cancellations');
    expect(sql).not.toContain('>=');
  });

  it('dates both kinds of income by the day they were paid and filters both by branch', () => {
    const { sql, values } = incomeEntries({
      from: '2026-10-01',
      to: '2026-10-31',
      branchId: '9b2c7a10-1111-4c4c-8888-123456789abc',
    });

    expect(sql).toContain('s.paid_on >= ');
    expect(sql).toContain('r.paid_on <= ');
    expect(sql).toContain('s.branch_id = ');
    expect(sql).toContain('r.branch_id = ');
    expect(values).toHaveLength(6);
  });
});
