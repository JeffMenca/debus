import {
  formatCount,
  formatDateTime,
  formatLongDate,
  formatPhone,
  formatQuetzales,
  initialsOf,
} from './format';

it('formats people, money and dates for Guatemala', () => {
  expect(initialsOf('Luis Ramírez Pérez')).toBe('LR');
  expect(initialsOf('marta')).toBe('M');
  expect(formatQuetzales(1250)).toMatch(/^Q\s?1,250\.00$/);
  expect(formatLongDate('2026-10-10')).toBe('10 de octubre de 2026');
});

it('handles blank names and keeps the day whatever the time zone', () => {
  expect(initialsOf('   ')).toBe('');
  expect(formatLongDate('2026-01-01')).toBe('1 de enero de 2026');
});

it('writes an eight digit phone with its hyphen and leaves anything else alone', () => {
  expect(formatPhone('77612233')).toBe('7761-2233');
  expect(formatPhone('1234')).toBe('1234');
});

it('shows a moment in Guatemala time, six hours behind UTC', () => {
  expect(formatDateTime('2026-10-10T15:30:00.000Z')).toMatch(/10\/10\/2026.*9:30/);
});

it('groups the thousands of a count', () => {
  expect(formatCount(3000)).toBe('3,000');
  expect(formatCount(45)).toBe('45');
});
