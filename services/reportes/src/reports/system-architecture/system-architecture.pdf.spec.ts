import { assertPrintable } from '../../common/pdf/printable-text';
import { toReportDocument } from './system-architecture.pdf';
import { architectureRows } from './system-architecture.rows';

describe('the system architecture report document', () => {
  const now = new Date('2026-10-28T15:00:00Z');
  const build = (filter: { service?: 'ventas' | 'reportes'; event?: 'TicketSold' } = {}) =>
    toReportDocument({ query: { ...filter, page: 1, pageSize: 20 }, now });

  it('titles the report for the whole system on a landscape sheet without a period', () => {
    const doc = build();

    expect(doc.title).toBe('Arquitectura');
    expect(doc.scope).toBe('Todo el sistema');
    expect(doc.period).toBeNull();
    expect(doc.landscape).toBe(true);
    expect(doc.generatedAt).toBe(now);
  });

  it('lists every event with who publishes it, its subscriptions and what it causes', () => {
    const [events] = build().tables;

    expect(events?.columns.map((column) => column.header)).toEqual([
      'Evento',
      'Lo publica',
      'Lo reciben (suscripción)',
      'Qué provoca',
    ]);
    expect(events?.rows).toHaveLength(architectureRows({}).length);
    expect(events?.rows.find((row) => row.cells[0] === 'TicketSold')?.cells).toEqual([
      'TicketSold',
      'Ventas\nventas-events',
      'reportes-from-ventas\nnotificaciones-from-ventas\nclientes-from-ventas',
      'Reportes suma el ingreso y Notificaciones envía el boleto por correo.',
    ]);
    expect(events?.rows.find((row) => row.cells[0] === 'ProbeSent')?.cells[0]).toBe('ProbeSent');
  });

  it('lists the direct calls with their circuit breaker', () => {
    const calls = build().tables[1];

    expect(calls?.title).toBe('Llamadas directas (con circuit breaker)');
    expect(calls?.rows.map((row) => row.cells)).toEqual([
      ['Ventas', 'Clientes', 'Cobrar con la cartera'],
      ['Ventas', 'Viajes', '¿Viaje a la venta?'],
      ['Viajes', 'Flota', '¿Bus y chofer libres?'],
    ]);
  });

  it('shows the totals of the whole system and of the filtered events', () => {
    expect(build({ event: 'TicketSold' }).highlights).toEqual([
      { label: 'Eventos de negocio', value: '26' },
      { label: 'Llamadas directas', value: '3' },
      { label: 'Comunicación por eventos', value: '89.7 %' },
      { label: 'Eventos con estos filtros', value: '1' },
    ]);
  });

  it('prints the filters that were chosen and keeps only their direct calls', () => {
    expect(build().filters).toEqual([]);
    expect(build({ service: 'ventas', event: 'TicketSold' }).filters).toEqual([
      'Servicio: Ventas',
      'Evento: TicketSold',
    ]);
    expect(build({ service: 'reportes' }).tables[1]?.rows).toEqual([]);
    expect(build({ event: 'TicketSold' }).tables[1]?.rows).toEqual([]);
  });

  it('explains how the services talk to each other', () => {
    expect(build().notes[0]).toMatch(/Pub\/Sub/);
  });

  it('only carries text the standard PDF font can print', () => {
    expect(() => assertPrintable(build())).not.toThrow();
  });
});
