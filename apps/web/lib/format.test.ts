import {
  formatCount,
  formatDateTime,
  formatLongDate,
  formatPhone,
  formatKm,
  formatPercent,
  formatShortDate,
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

it('writes a day short, with the year only when asked', () => {
  expect(formatShortDate('2026-11-04')).toBe('4 nov');
  expect(formatShortDate('2027-03-04', true)).toBe('4 mar 2027');
});

it('writes a distance in kilometres with at most one decimal', () => {
  expect(formatKm(206.5)).toBe('206.5 km');
  expect(formatKm(150)).toBe('150 km');
  expect(formatKm(1250.25)).toBe('1,250.3 km');
});

it('writes a percentage with one decimal and a dash when there is nothing to divide by', () => {
  expect(formatPercent(44.8)).toBe('44.8 %');
  expect(formatPercent(50)).toBe('50.0 %');
  expect(formatPercent(-12.5)).toBe('-12.5 %');
  expect(formatPercent(null)).toBe('—');
});
