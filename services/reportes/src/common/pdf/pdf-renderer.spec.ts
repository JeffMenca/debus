import pdfmake from 'pdfmake';
import { PdfRenderer } from './pdf-renderer';
import type { PdfTable, ReportDocument } from './report-document';

const table: PdfTable = {
  columns: [
    { header: 'Placa', width: 'auto' },
    { header: 'Total', width: '*', align: 'right' },
  ],
  rows: [{ cells: ['P123ABC', 'Q 2,000.00'] }],
  emptyMessage: 'No hay gastos.',
};

const doc: ReportDocument = {
  title: 'Gastos de taller por bus y categoría',
  scope: 'Sucursal Quetzaltenango',
  period: 'Todos los registros',
  filters: ['Búsqueda: volvó'],
  highlights: [{ label: 'Total', value: 'Q 2,000.00' }],
  tables: [table],
  notes: ['Niños, ñandú y acentos: áéíóú.'],
  generatedAt: new Date('2026-10-13T21:20:00Z'),
  landscape: true,
};

describe('PdfRenderer', () => {
  it('renders a real PDF with the standard fonts', async () => {
    const buffer = await new PdfRenderer().render(doc);

    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('renders a report with no rows', async () => {
    const empty = { ...doc, tables: [{ ...table, rows: [] }] };

    const buffer = await new PdfRenderer().render(empty);

    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('never reads a file or a URL beyond its own standard fonts', () => {
    const policies = pdfmake as unknown as {
      urlAccessPolicy: (url: string) => boolean;
      localAccessPolicy: (path: string) => boolean;
    };

    expect(policies.urlAccessPolicy('https://example.com/logo.png')).toBe(false);
    expect(policies.localAccessPolicy('/etc/passwd')).toBe(false);
    expect(policies.localAccessPolicy('Helvetica-Bold')).toBe(true);
  });
});
