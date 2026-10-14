// People type "148,614" or "1 180.50"; the separators are dropped and what is left must be a number.
const stripSeparators = (text: string) => text.replace(/[,\s]/g, '');

export function parseWholeNumber(text: string): number | null {
  const clean = stripSeparators(text);
  return /^\d+$/.test(clean) ? Number(clean) : null;
}

// Quetzales with up to two decimals.
export function parseMoney(text: string): number | null {
  const clean = stripSeparators(text);
  return /^\d+(\.\d{1,2})?$/.test(clean) ? Number(clean) : null;
}
