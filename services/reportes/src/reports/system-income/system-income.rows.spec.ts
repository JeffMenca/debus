import {
  INCOME_CONCEPT_LABELS,
  incomeConceptOf,
  incomeDetail,
  toIncomeRow,
  toIncomeTotals,
} from './system-income.rows';

describe('system income rows', () => {
  const ticket = {
    id: '1f0e2d3c-4b5a-4968-8776-655443322110',
    branch_id: '9b2c7a10-1111-4c4c-8888-123456789abc',
    branch_name: 'Quetzaltenango',
    channel: 'ONLINE',
    day: new Date('2026-10-20T00:00:00.000Z'),
    origin_label: 'Quetzaltenango',
    destination_label: 'Guatemala',
    client_name: null as string | null,
    quantity: 2,
    amount: 170,
  };

  it('names the concept of each channel', () => {
    expect(incomeConceptOf('ONLINE')).toBe('ONLINE_TICKET');
    expect(incomeConceptOf('COUNTER')).toBe('COUNTER_TICKET');
    expect(incomeConceptOf('RENTAL')).toBe('RENTAL');
    expect(() => incomeConceptOf('GIFT')).toThrow('GIFT');
  });

  it('labels every concept in plain Spanish', () => {
    expect(INCOME_CONCEPT_LABELS).toEqual({
      ONLINE_TICKET: 'Boleto en línea',
      COUNTER_TICKET: 'Boleto de ventanilla',
      RENTAL: 'Alquiler',
    });
  });

  it('maps a raw ticket to the contract row with the paid day', () => {
    expect(toIncomeRow(ticket)).toEqual({
      id: ticket.id,
      branchId: ticket.branch_id,
      branchName: 'Quetzaltenango',
      concept: 'ONLINE_TICKET',
      day: '2026-10-20',
      originLabel: 'Quetzaltenango',
      destinationLabel: 'Guatemala',
      clientName: null,
      quantity: 2,
      amount: 170,
    });
  });

  it('keeps the client of a rental', () => {
    expect(
      toIncomeRow({ ...ticket, channel: 'RENTAL', client_name: 'Colegio San José', quantity: 35 }),
    ).toMatchObject({ concept: 'RENTAL', clientName: 'Colegio San José', quantity: 35 });
  });

  it('details a ticket by its route and a rental by its client and route', () => {
    expect(incomeDetail(toIncomeRow(ticket))).toBe('Quetzaltenango – Guatemala');
    expect(
      incomeDetail(toIncomeRow({ ...ticket, channel: 'RENTAL', client_name: 'Colegio San José' })),
    ).toBe('Colegio San José · Quetzaltenango – Guatemala');
  });

  it('turns the totals into zeros when nothing matched', () => {
    expect(toIncomeTotals(undefined)).toEqual({
      entries: 0,
      amount: 0,
      onlineTickets: 0,
      counterTickets: 0,
      rentals: 0,
    });
    expect(
      toIncomeTotals({
        entries: 3,
        amount: 425,
        online_tickets: 170,
        counter_tickets: 85,
        rentals: 170,
      }),
    ).toEqual({ entries: 3, amount: 425, onlineTickets: 170, counterTickets: 85, rentals: 170 });
  });
});
