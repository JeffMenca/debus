import type { BranchRentalIncomeRow } from '@debus/contracts';
import { assertPrintable } from '../../common/pdf/printable-text';
import { toReportDocument } from './branch-rental-income.pdf';

describe('the rental income report document', () => {
  const rows: BranchRentalIncomeRow[] = [
    {
      rentalId: '1f0e2d3c-4b5a-4968-8776-655443322110',
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
    },
    {
      rentalId: '2f0e2d3c-4b5a-4968-8776-655443322110',
      clientName: 'Excursión Los Pérez',
      nit: 'CF',
      originLabel: 'Quetzaltenango',
      destinationLabel: 'Semuc Champey',
      departureAt: '2026-10-30T10:00:00.000Z',
      returnAt: null,
      paidOn: '2026-10-18',
      passengers: 20,
      busPlate: null,
      price: 1500,
    },
  ];
  const totals = { rentals: 2, income: 4260 };
  const now = new Date('2026-10-13T21:20:00Z');
  const build = (query: { from?: string; to?: string; q?: string } = {}) =>
    toReportDocument({
      branchName: 'Quetzaltenango',
      query: { ...query, page: 1, pageSize: 20 },
      rows,
      totals,
      now,
    });

  it('lists each rental with the client, the trip, the payment, the bus and the price', () => {
    const table = build().tables[0];

    expect(table?.columns.map((c) => c.header)).toEqual([
      'Cliente',
      'Origen',
      'Destino',
      'Salida',
      'Regreso',
      'Pagado el',
      'Bus',
      'Pasajeros',
      'Precio',
    ]);
    expect(table?.rows[0]).toEqual({
      cells: [
        'Colegio San José (NIT 1234567-8)',
        'Quetzaltenango',
        'Panajachel',
        '24/10/2026 07:00',
        '24/10/2026 17:00',
        '21 oct. 2026',
        'C-482BTX',
        '35',
        'Q 2,760.00',
      ],
    });
  });

  it('says one-way for a rental without return and to assign for one without a bus', () => {
    const row = build().tables[0]?.rows[1];

    expect(row?.cells[4]).toBe('Solo ida');
    expect(row?.cells[6]).toBe('Por asignar');
  });

  it('closes the table with the total', () => {
    expect(build().tables[0]?.rows[2]).toEqual({
      cells: ['Total', '', '', '', '', '', '', '55', 'Q 4,260.00'],
      tone: 'total',
    });
  });

  it('shows the highlights of the filtered set', () => {
    expect(build().highlights).toEqual([
      { label: 'Alquileres', value: '2' },
      { label: 'Ingresos', value: 'Q 4,260.00' },
    ]);
  });

  it('names the period and the search that were chosen', () => {
    expect(build().period).toBe('Todos los registros');
    expect(build({ from: '2026-10-01', to: '2026-10-13' }).period).toBe(
      'Del 1 oct. 2026 al 13 oct. 2026',
    );
    expect(build().filters).toEqual([]);
    expect(build({ q: 'colegio' }).filters).toEqual(['Búsqueda: colegio']);
  });

  it('titles the report, scopes it to the branch and uses a landscape sheet', () => {
    const doc = build();

    expect(doc.title).toBe('Ingresos por alquiler de buses');
    expect(doc.scope).toBe('Sucursal Quetzaltenango');
    expect(doc.landscape).toBe(true);
    expect(doc.notes).toEqual([]);
    expect(doc.generatedAt).toBe(now);
  });

  it('explains an empty result', () => {
    const doc = toReportDocument({
      branchName: null,
      query: { page: 1, pageSize: 20 },
      rows: [],
      totals: { rentals: 0, income: 0 },
      now,
    });

    expect(doc.scope).toBe('Sucursal');
    expect(doc.tables[0]?.rows).toEqual([]);
    expect(doc.tables[0]?.emptyMessage).toBe('No hay alquileres pagados con esos filtros.');
  });

  it('only carries text the standard PDF font can print, filters included', () => {
    expect(() =>
      assertPrintable(build({ from: '2026-10-01', to: '2026-10-13', q: 'colegio' })),
    ).not.toThrow();
  });
});
