import { render, screen } from '@testing-library/react';
import { LicenseBadge } from './license-badge';

const TODAY = '2026-10-12';
const badge = (expiresOn: string) => render(<LicenseBadge expiresOn={expiresOn} today={TODAY} />);

it.each([
  ['2026-10-15', 'Vence en 3 días'],
  ['2026-10-13', 'Vence mañana'],
  ['2026-10-12', 'Vence hoy'],
  ['2026-10-10', 'Venció hace 2 días'],
  ['2026-10-11', 'Venció ayer'],
  ['2026-11-04', 'Vence en 23 días'],
  ['2026-12-04', 'Vence el 4 dic'],
  ['2027-03-04', 'Vence el 4 mar 2027'],
])('says when a licence ending on %s expires', (expiresOn, text) => {
  badge(expiresOn);

  expect(screen.getByText(text)).toBeInTheDocument();
});

it.each([
  ['2026-10-10', 'bg-coral-100', 'text-coral-700'],
  ['2026-10-27', 'bg-coral-100', 'text-coral-700'],
  ['2026-11-05', 'bg-mango-100', 'text-mango-700'],
])('highlights %s with the tokens of its urgency', (expiresOn, background, text) => {
  badge(expiresOn);

  expect(screen.getByText(/Vence|Venció/)).toHaveClass(background, text);
});

it('does not highlight a licence that is far from expiring', () => {
  badge('2027-03-04');

  const text = screen.getByText('Vence el 4 mar 2027');
  expect(text).not.toHaveClass('bg-coral-100');
  expect(text).not.toHaveClass('bg-mango-100');
  expect(text).toHaveClass('text-muted-foreground');
});

it('counts from today in Guatemala when no day is given', () => {
  jest.useFakeTimers().setSystemTime(new Date('2026-10-12T20:00:00-06:00'));
  render(<LicenseBadge expiresOn="2026-10-14" />);

  expect(screen.getByText('Vence en 2 días')).toBeInTheDocument();
  jest.useRealTimers();
});
