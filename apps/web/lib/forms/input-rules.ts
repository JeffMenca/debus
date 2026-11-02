import {
  ADDRESS_MAX,
  BRANCH_CODE_MAX,
  DPI_DIGITS,
  EMAIL_MAX,
  LICENSE_MAX,
  NIT_MAX_LENGTH,
  PASSWORD_MAX,
  PHONE_DIGITS,
  PLATE_LENGTH,
} from '@debus/contracts';
import type { HTMLAttributes } from 'react';

export interface InputRule {
  inputMode?: HTMLAttributes<HTMLInputElement>['inputMode'];
  // Only for free text: the browser cuts a paste before `sanitize` could clean it.
  maxLength?: number;
  sanitize?: (value: string) => string;
}

const digits = (max: number) => (value: string) => value.replace(/\D/g, '').slice(0, max);
const upperAlnum = (max: number) => (value: string) =>
  value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, max);

function cleanNit(value: string): string {
  const raw = value.toUpperCase().replace(/[^\dK]/g, '');
  const body = raw.replace(/K/g, '');
  const tail = raw.endsWith('K') ? 'K' : '';
  return body.slice(0, NIT_MAX_LENGTH - tail.length) + tail;
}

function cleanDecimal(value: string, whole: number, decimals: number): string {
  const [head = '', ...rest] = value.replace(/[^\d.]/g, '').split('.');
  const tail = rest.join('').slice(0, decimals);
  const number = head.slice(0, whole);
  return value.includes('.') && decimals > 0 ? `${number}.${tail}` : number;
}

export const inputRules = {
  // Date and time pickers and other controls the browser already restricts.
  native: {},
  phone: { inputMode: 'numeric', sanitize: digits(PHONE_DIGITS) },
  dpi: { inputMode: 'numeric', sanitize: digits(DPI_DIGITS) },
  nit: { sanitize: cleanNit },
  nitOrCf: {
    sanitize: (value: string) =>
      /^\s*c/i.test(value)
        ? value.toUpperCase().replace(/[^CF]/g, '').slice(0, 2)
        : cleanNit(value),
  },
  plate: { sanitize: upperAlnum(PLATE_LENGTH) },
  license: { sanitize: upperAlnum(LICENSE_MAX) },
  branchCode: {
    sanitize: (value: string) =>
      value
        .toUpperCase()
        .replace(/[^A-Z]/g, '')
        .slice(0, BRANCH_CODE_MAX),
  },
  coordinate: {
    inputMode: 'decimal',
    sanitize: (value: string) =>
      (value.trimStart().startsWith('-') ? '-' : '') + cleanDecimal(value, 2, 6),
  },
  email: { inputMode: 'email', maxLength: EMAIL_MAX },
  password: { maxLength: PASSWORD_MAX },
  address: { maxLength: ADDRESS_MAX },
  text: (maxLength: number): InputRule => ({ maxLength }),
  integer: (maxDigits: number): InputRule => ({
    inputMode: 'numeric',
    sanitize: digits(maxDigits),
  }),
  decimal: (whole: number, decimals: number): InputRule => ({
    inputMode: 'decimal',
    sanitize: (value) => cleanDecimal(value, whole, decimals),
  }),
} as const satisfies Record<string, InputRule | ((...args: number[]) => InputRule)>;
