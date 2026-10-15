import type { ReportDocument } from './report-document';

// The standard Helvetica of a PDF encodes WinAnsi (Windows-1252): ASCII, Latin-1 and the
// extra punctuation of the 0x80-0x9F block. Any other character is drawn as garbage.
const WIN_ANSI_EXTRAS = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
const isPrintable = (char: string): boolean => {
  const code = char.codePointAt(0) ?? 0;
  return (
    char === '\n' ||
    (code >= 0x20 && code <= 0x7e) ||
    (code >= 0xa0 && code <= 0xff) ||
    WIN_ANSI_EXTRAS.includes(char)
  );
};

export class UnprintableTextError extends Error {
  constructor(readonly characters: string[]) {
    super(`The PDF font cannot print: ${characters.join(' ')}`);
    this.name = 'UnprintableTextError';
  }
}

function* textsOf(value: unknown): Generator<string> {
  if (typeof value === 'string') yield value;
  else if (Array.isArray(value)) for (const item of value) yield* textsOf(item);
  else if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
    for (const item of Object.values(value)) yield* textsOf(item);
  }
}

// Each distinct character of the document that the standard font cannot print, in order of appearance.
export function findUnprintable(doc: ReportDocument): string[] {
  const found = new Set<string>();
  for (const text of textsOf(doc)) {
    for (const char of text) if (!isPrintable(char)) found.add(char);
  }
  return [...found];
}

// The strict check for the text the code writes (titles, headers, notes, labels): a character the
// font cannot print there is a programming error, so the tests of each report fail on it.
export function assertPrintable(doc: ReportDocument): void {
  const characters = findUnprintable(doc);
  if (characters.length > 0) throw new UnprintableTextError(characters);
}

const SUBSTITUTE = '?';
const EQUIVALENTS: Record<string, string> = {
  // Apostrophes of the Mayan alphabets (Kʼicheʼ), modifier letters and primes.
  ʼ: '’',
  ʻ: '’',
  ʽ: '’',
  '‛': '’',
  '′': '’',
  '‟': '“',
  '″': '”',
  // Arrows read as the dash that separates a route.
  '→': '–',
  '⇒': '–',
  '➔': '–',
  '➜': '–',
  '➝': '–',
  '⟶': '–',
  // Hyphens and minus signs.
  '‐': '-',
  '‑': '-',
  '‒': '-',
  '−': '-',
  '―': '—',
  // Spaces of other widths, and the control characters the font has no glyph for.
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
  '　': ' ',
  '\t': ' ',
  '\r': '',
  // Invisible joiners, marks and selectors that only shape a neighbouring character.
  '​': '',
  '‌': '',
  '‍': '',
  '⁠': '',
  '︎': '',
  '️': '',
  '﻿': '',
};
const COMBINING_MARKS = /\p{M}/u;

export interface Replacement {
  codePoint: string;
  replacement: string;
}

const codePointOf = (char: string): string =>
  `U+${(char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}`;

// A letter with an accent the font lacks keeps its base letter ("Ā" -> "A").
function withoutAccent(char: string): string | null {
  const base = [...char.normalize('NFD')].filter((part) => !COMBINING_MARKS.test(part)).join('');
  return base !== char && base !== '' && [...base].every(isPrintable) ? base : null;
}

// What the person reads in the PDF for text that comes from the data (a client, a bus model, a
// search term): the closest character the font has, a "?" for what has none, and the list of
// what was replaced so the log can say it. The screen keeps the exact text.
export function toPrintable(text: string): { text: string; replaced: Replacement[] } {
  const replaced = new Map<string, Replacement>();
  let result = '';
  let lastWasSubstitute = false;
  for (const char of text.normalize('NFC')) {
    const mapped = isPrintable(char) ? char : (EQUIVALENTS[char] ?? withoutAccent(char));
    const replacement = mapped ?? SUBSTITUTE;
    if (replacement !== char) {
      replaced.set(char, { codePoint: codePointOf(char), replacement });
    }
    if (replacement === '') continue;
    // A run of unknown characters (an emoji with its joiners) is a single question mark.
    if (replacement === SUBSTITUTE && lastWasSubstitute) continue;
    result += replacement;
    lastWasSubstitute = replacement === SUBSTITUTE;
  }
  return { text: result, replaced: [...replaced.values()] };
}

function substitute<T>(value: T, replaced: Map<string, Replacement>): T {
  if (typeof value === 'string') {
    const result = toPrintable(value);
    for (const item of result.replaced) replaced.set(item.codePoint, item);
    return result.text as T;
  }
  if (Array.isArray(value)) return value.map((item) => substitute(item, replaced)) as T;
  if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, substitute(item, replaced)]),
    ) as T;
  }
  return value;
}

export function toPrintableDocument(doc: ReportDocument): {
  doc: ReportDocument;
  replaced: Replacement[];
} {
  const replaced = new Map<string, Replacement>();
  return { doc: substitute(doc, replaced), replaced: [...replaced.values()] };
}
