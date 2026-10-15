import {
  UnprintableTextError,
  assertPrintable,
  findUnprintable,
  toPrintable,
  toPrintableDocument,
} from './printable-text';
import type { ReportDocument } from './report-document';

const doc: ReportDocument = {
  title: 'Ingresos por venta de boletos',
  scope: 'Sucursal Quetzaltenango',
  period: null,
  filters: ['Ruta: Quetzaltenango – Guatemala'],
  highlights: [{ label: 'Total', value: 'Q 2,000.00' }],
  tables: [
    {
      title: 'Resumen',
      columns: [{ header: 'Ruta', width: '*' }],
      rows: [{ cells: ['Niños, ñandú, áéíóú, ü y “comillas” — € 5…'] }],
      emptyMessage: 'No hay datos.',
    },
  ],
  notes: ['Línea uno\nLínea dos · fin'],
  generatedAt: new Date('2026-10-13T21:20:00Z'),
  landscape: false,
};

describe('findUnprintable', () => {
  it('accepts the Spanish text, the dashes, the quotes and the euro sign of the standard font', () => {
    expect(findUnprintable(doc)).toEqual([]);
  });

  it('finds the route arrow, which Helvetica has no glyph for', () => {
    const arrow = { ...doc, filters: ['Ruta: Quetzaltenango → Guatemala'] };

    expect(findUnprintable(arrow)).toEqual(['→']);
  });

  it('looks in every text of the document, not only the cells', () => {
    const bad: ReportDocument = {
      ...doc,
      title: 'Título ✓',
      period: 'Periodo ★',
      highlights: [{ label: '→', value: '≥' }],
      tables: [
        {
          title: '✗',
          columns: [{ header: '☺', width: '*' }],
          rows: [{ cells: ['日本'] }],
          emptyMessage: '✓',
        },
      ],
      notes: ['😀'],
    };

    expect(findUnprintable(bad)).toEqual(
      expect.arrayContaining(['✓', '★', '→', '≥', '✗', '☺', '日', '本', '😀']),
    );
  });

  it('lists each character once', () => {
    const repeated = { ...doc, filters: ['→ → →', '→'] };

    expect(findUnprintable(repeated)).toEqual(['→']);
  });
});

describe('assertPrintable', () => {
  it('lets a printable document through', () => {
    expect(() => assertPrintable(doc)).not.toThrow();
  });

  it('fails naming the characters the PDF could not print', () => {
    const arrow = { ...doc, notes: ['Xela → Antigua'] };

    expect(() => assertPrintable(arrow)).toThrow(UnprintableTextError);
    expect(() => assertPrintable(arrow)).toThrow('→');
  });
});

describe('toPrintable', () => {
  it('leaves text the standard font can print as it is, without reporting anything', () => {
    expect(toPrintable('Niños, ñandú — “José” € 5…')).toEqual({
      text: 'Niños, ñandú — “José” € 5…',
      replaced: [],
    });
  });

  it('turns the apostrophes of the Mayan alphabets into the typographic one', () => {
    expect(toPrintable('Kʼicheʼ Qʻanjobʻal')).toMatchObject({ text: 'K’iche’ Q’anjob’al' });
  });

  it('turns arrows into a dash and the other dashes and spaces into the ones the font has', () => {
    expect(toPrintable('Xela → Antigua').text).toBe('Xela – Antigua');
    expect(toPrintable('a‑b−c').text).toBe('a-b-c');
    expect(toPrintable('a\u2009b\u3000c').text).toBe('a b c');
  });

  it('composes accents typed as two characters and drops the accent the font lacks', () => {
    expect(toPrintable('Jose\u0301').text).toBe('José');
    expect(toPrintable('Ānge').text).toBe('Ange');
  });

  it('writes a question mark for what has no equivalent, once per run, and drops invisible joiners', () => {
    expect(toPrintable('AK8J 🚌').text).toBe('AK8J ?');
    expect(toPrintable('👨‍👩‍👧 familia').text).toBe('? familia');
    expect(toPrintable('日本').text).toBe('?');
    expect(toPrintable('a\u200Bb').text).toBe('ab');
  });

  it('keeps line breaks and turns tabs and carriage returns into what the font prints', () => {
    expect(toPrintable('uno\r\ndos\ttres').text).toBe('uno\ndos tres');
  });

  it('reports each replaced character once, by code point and with its replacement', () => {
    expect(toPrintable('Kʼicheʼ → Xela 🚌 🚌').replaced).toEqual([
      { codePoint: 'U+02BC', replacement: '’' },
      { codePoint: 'U+2192', replacement: '–' },
      { codePoint: 'U+1F68C', replacement: '?' },
    ]);
  });
});

describe('toPrintableDocument', () => {
  const dirty: ReportDocument = {
    ...doc,
    scope: 'Sucursal Kʼicheʼ',
    filters: ['Búsqueda: José→'],
    tables: [
      {
        columns: [{ header: 'Modelo', width: '*', align: 'right' }],
        rows: [{ cells: ['AK8J 🚌'], tone: 'total' }],
        emptyMessage: 'No hay datos.',
      },
    ],
  };

  it('substitutes the text of every part of the document and keeps its shape', () => {
    const { doc: clean, replaced } = toPrintableDocument(dirty);

    expect(clean).toEqual({
      ...dirty,
      scope: 'Sucursal K’iche’',
      filters: ['Búsqueda: José–'],
      tables: [
        {
          columns: [{ header: 'Modelo', width: '*', align: 'right' }],
          rows: [{ cells: ['AK8J ?'], tone: 'total' }],
          emptyMessage: 'No hay datos.',
        },
      ],
    });
    expect(clean.generatedAt).toBe(dirty.generatedAt);
    expect(findUnprintable(clean)).toEqual([]);
    expect(replaced.map((item) => item.codePoint)).toEqual(['U+02BC', 'U+2192', 'U+1F68C']);
  });

  it('does not touch the document it was given', () => {
    toPrintableDocument(dirty);

    expect(dirty.scope).toBe('Sucursal Kʼicheʼ');
  });
});
