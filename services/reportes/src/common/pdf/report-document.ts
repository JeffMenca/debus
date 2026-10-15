import type { Content, ContentTable, TDocumentDefinitions, TableCell } from 'pdfmake/interfaces';
import { formatInstant } from '../report-format';

export type PdfAlign = 'left' | 'right';
export interface PdfColumn {
  header: string;
  width: number | '*' | 'auto';
  align?: PdfAlign;
}
export type PdfRowTone = 'normal' | 'group' | 'subtotal' | 'total';
export interface PdfRow {
  cells: string[];
  tone?: PdfRowTone;
}
export interface PdfTable {
  title?: string;
  columns: PdfColumn[];
  rows: PdfRow[];
  emptyMessage: string;
}
export interface ReportDocument {
  title: string;
  // "Sucursal Quetzaltenango"
  scope: string;
  // reportPeriod(...), or null when the report has no interval
  period: string | null;
  filters: string[];
  highlights: { label: string; value: string }[];
  tables: PdfTable[];
  notes: string[];
  generatedAt: Date;
  landscape: boolean;
}

// The colors of a PDF are not web tokens: the tint is the report color of the design system.
const COLORS = { tint: '#E9E2FF', group: '#F1F1F4', line: '#D9D9E0', muted: '#6B6B76' };
const MARGINS: [number, number, number, number] = [36, 36, 36, 48];

interface CellStyle {
  bold?: boolean;
  fillColor?: string;
}

const cellStyle: Record<PdfRowTone, CellStyle> = {
  normal: {},
  group: { bold: true, fillColor: COLORS.group },
  subtotal: { bold: true },
  total: { bold: true, fillColor: COLORS.tint },
};

function alignmentOf(align?: PdfAlign): { alignment?: 'right' } {
  return align === 'right' ? { alignment: 'right' } : {};
}

function headerCell({ header, align }: PdfColumn): TableCell {
  return { text: header, bold: true, fillColor: COLORS.group, ...alignmentOf(align) };
}

function bodyRow({ cells, tone = 'normal' }: PdfRow, columns: PdfColumn[]): TableCell[] {
  return cells.map((text, index) => ({
    text,
    ...cellStyle[tone],
    ...alignmentOf(columns[index]?.align),
  }));
}

function tableContent(table: PdfTable): Content[] {
  const title: Content[] = table.title
    ? [{ text: table.title, bold: true, fontSize: 11, margin: [0, 10, 0, 4] }]
    : [];
  if (table.rows.length === 0) {
    return [...title, { text: table.emptyMessage, italics: true, margin: [0, 8, 0, 0] }];
  }
  const grid: ContentTable = {
    table: {
      headerRows: 1,
      widths: table.columns.map((column) => column.width),
      body: [
        table.columns.map(headerCell),
        ...table.rows.map((row) => bodyRow(row, table.columns)),
      ],
    },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0,
      hLineColor: () => COLORS.line,
      paddingTop: () => 3,
      paddingBottom: () => 3,
    },
    margin: [0, title.length > 0 ? 0 : 8, 0, 0],
  };
  return [...title, grid];
}

function highlightsContent(highlights: ReportDocument['highlights']): Content[] {
  if (highlights.length === 0) return [];
  return [
    {
      columns: highlights.map(({ label, value }) => ({
        width: '*',
        stack: [
          { text: label, fontSize: 8, color: COLORS.muted },
          { text: value, bold: true, fontSize: 12 },
        ],
      })),
      margin: [0, 10, 0, 0],
    },
  ];
}

export function buildDocDefinition(doc: ReportDocument): TDocumentDefinitions {
  const header: Content[] = [
    { text: 'debus', bold: true, fontSize: 9, color: COLORS.muted },
    { text: doc.title, bold: true, fontSize: 16, margin: [0, 2, 0, 2] },
    { text: doc.scope },
    ...(doc.period === null ? [] : [{ text: `Periodo: ${doc.period}` }]),
    ...(doc.filters.length > 0 ? [{ text: doc.filters.join(' · '), color: COLORS.muted }] : []),
    { text: `Generado el ${formatInstant(doc.generatedAt)}`, color: COLORS.muted },
  ];

  return {
    pageSize: 'LETTER',
    pageOrientation: doc.landscape ? 'landscape' : 'portrait',
    pageMargins: MARGINS,
    defaultStyle: { font: 'Helvetica', fontSize: 9 },
    content: [
      ...header,
      ...highlightsContent(doc.highlights),
      ...doc.tables.flatMap(tableContent),
      ...doc.notes.map((note): Content => ({ text: note, italics: true, margin: [0, 8, 0, 0] })),
    ],
    footer: (page: number, pages: number) => ({
      margin: [36, 12, 36, 0],
      fontSize: 8,
      color: COLORS.muted,
      columns: [{ text: 'debus' }, { text: `Página ${page} de ${pages}`, alignment: 'right' }],
    }),
  };
}
