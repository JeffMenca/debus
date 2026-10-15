import type { TDocumentDefinitions } from 'pdfmake/interfaces';
import { type PdfTable, type ReportDocument, buildDocDefinition } from './report-document';

interface TableNode {
  headerRows: number;
  widths: unknown[];
  body: Record<string, unknown>[][];
}

// The first table node of the document, wherever it sits in the content tree.
function findTable(definition: TDocumentDefinitions): TableNode {
  const pending: unknown[] = [definition.content];
  while (pending.length > 0) {
    const node = pending.shift();
    if (Array.isArray(node)) pending.push(...node);
    else if (node && typeof node === 'object') {
      if ('table' in node) return node.table as TableNode;
      pending.push(...Object.values(node));
    }
  }
  throw new Error('the document has no table');
}

const table: PdfTable = {
  columns: [
    { header: 'Placa', width: 'auto' },
    { header: 'Km', width: 'auto', align: 'right' },
  ],
  rows: [{ cells: ['P123ABC', '1,204 km'] }, { cells: ['Total', '1,204 km'], tone: 'total' }],
  emptyMessage: 'No hay buses con esos filtros.',
};

const cellAt = (grid: TableNode, row: number, column: number) => grid.body[row]?.[column];

const doc: ReportDocument = {
  title: 'Listado general de buses',
  scope: 'Sucursal Quetzaltenango',
  period: null,
  filters: ['Estado: En taller'],
  highlights: [{ label: 'Buses', value: '3' }],
  tables: [table],
  notes: [],
  generatedAt: new Date('2026-10-13T21:20:00Z'),
  landscape: false,
};

describe('buildDocDefinition', () => {
  it('repeats the header row on every page and right-aligns numbers', () => {
    const grid = findTable(buildDocDefinition(doc));

    expect(grid.headerRows).toBe(1);
    expect(grid.widths).toEqual(['auto', 'auto']);
    expect(cellAt(grid, 0, 0)).toMatchObject({ text: 'Placa', bold: true });
    expect(cellAt(grid, 1, 1)).toMatchObject({ text: '1,204 km', alignment: 'right' });
  });

  it('makes total rows bold on the report tint', () => {
    expect(cellAt(findTable(buildDocDefinition(doc)), 2, 0)).toMatchObject({
      bold: true,
      fillColor: '#E9E2FF',
    });
  });

  it('makes group and subtotal rows bold, and only group rows grey', () => {
    const toned: ReportDocument = {
      ...doc,
      tables: [
        {
          ...table,
          rows: [
            { cells: ['Motor', ''], tone: 'group' },
            { cells: ['Subtotal', '1'], tone: 'subtotal' },
            { cells: ['P123ABC', '2'] },
          ],
        },
      ],
    };

    const grid = findTable(buildDocDefinition(toned));

    expect(cellAt(grid, 1, 0)).toMatchObject({ bold: true, fillColor: '#F1F1F4' });
    expect(cellAt(grid, 2, 0)).toMatchObject({ bold: true });
    expect(cellAt(grid, 2, 0)).not.toHaveProperty('fillColor');
    expect(cellAt(grid, 3, 0)).not.toHaveProperty('bold');
  });

  it('writes the empty message instead of a lonely header', () => {
    const empty = { ...doc, tables: [{ ...table, rows: [] }] };

    const text = JSON.stringify(buildDocDefinition(empty));

    expect(text).toContain('No hay buses con esos filtros.');
    expect(text).not.toContain('"table"');
  });

  it('names the branch, the period, the filters and when it was made, in Guatemala time', () => {
    const text = JSON.stringify(buildDocDefinition({ ...doc, period: 'Todos los registros' }));

    expect(text).toContain('Sucursal Quetzaltenango');
    expect(text).toContain('Todos los registros');
    expect(text).toContain('Estado: En taller');
    expect(text).toContain('13/10/2026 15:20');
  });

  it('leaves the period line out when the report has no interval', () => {
    expect(JSON.stringify(buildDocDefinition(doc))).not.toContain('Periodo');
    expect(JSON.stringify(buildDocDefinition({ ...doc, period: 'Todos los registros' }))).toContain(
      'Periodo: Todos los registros',
    );
  });

  it('shows the highlights, the table titles and the notes', () => {
    const rich: ReportDocument = {
      ...doc,
      tables: [{ ...table, title: 'Por categoría' }],
      notes: ['Los boletos de viajes eliminados no cuentan.'],
    };

    const text = JSON.stringify(buildDocDefinition(rich));

    expect(text).toContain('"Buses"');
    expect(text).toContain('"3"');
    expect(text).toContain('Por categoría');
    expect(text).toContain('Los boletos de viajes eliminados no cuentan.');
  });

  it('leaves the highlights and the filters out when there are none', () => {
    const plain = JSON.stringify(buildDocDefinition({ ...doc, highlights: [], filters: [] }));

    expect(plain).not.toContain('"columns"');
    expect(plain).not.toContain('En taller');
  });

  it('prints on letter paper, in landscape when the report is wide', () => {
    expect(buildDocDefinition(doc)).toMatchObject({
      pageSize: 'LETTER',
      pageOrientation: 'portrait',
    });
    expect(buildDocDefinition({ ...doc, landscape: true }).pageOrientation).toBe('landscape');
  });

  it('numbers the pages', () => {
    const footer = buildDocDefinition(doc).footer as (page: number, pages: number) => unknown;

    expect(JSON.stringify(footer(2, 5))).toContain('Página 2 de 5');
  });
});
