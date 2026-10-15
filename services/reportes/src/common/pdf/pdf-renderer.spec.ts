import { Logger } from '@nestjs/common';
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

  it('prints what the font lacks as its closest equivalent and warns of what it replaced', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const createPdf = jest.spyOn(pdfmake, 'createPdf');
    const dirty = { ...doc, scope: 'Sucursal Kʼicheʼ', notes: ['AK8J 🚌 · Xela → Antigua'] };

    const buffer = await new PdfRenderer().render(dirty);

    const drawn = JSON.stringify(createPdf.mock.calls.at(-1)?.[0]);
    createPdf.mockRestore();
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(drawn).toContain('Sucursal K’iche’');
    expect(drawn).toContain('AK8J ? · Xela – Antigua');
    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0]?.[0]);
    expect(message).toContain('U+02BC');
    expect(message).toContain('U+1F68C');
    expect(message).not.toContain('AK8J');
    warn.mockRestore();
  });

  it('does not warn when everything could be printed', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    await new PdfRenderer().render(doc);

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
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
