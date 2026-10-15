import { formatQuetzales } from '@/lib/format';

// The last character of a NIT is its check digit; people write it after a hyphen.
export const formatNit = (nit: string): string => `${nit.slice(0, -1)}-${nit.slice(-1)}`;

export const formatDpi = (dpi: string): string =>
  /^\d{13}$/.test(dpi) ? `${dpi.slice(0, 4)} ${dpi.slice(4, 9)} ${dpi.slice(9)}` : dpi;

export const signedQuetzales = (amount: number): string =>
  `${amount < 0 ? '−' : '+'} ${formatQuetzales(Math.abs(amount))}`;
