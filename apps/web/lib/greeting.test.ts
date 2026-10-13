import { greetingFor, longDayHeading } from './greeting';

// Guatemala is always UTC-6, so 12:00 UTC is 06:00 there.
const at = (utcHour: number, utcMinute = 0) => new Date(Date.UTC(2026, 9, 5, utcHour, utcMinute));

describe('greetingFor', () => {
  it.each([
    [6, 0, 'Buenos días'],
    [17, 59, 'Buenos días'],
    [18, 0, 'Buenas tardes'],
    [0, 59, 'Buenas tardes'],
    [1, 0, 'Buenas noches'],
    [5, 59, 'Buenas noches'],
  ])('at %i:%i UTC says %s in Guatemala', (hour, minute, greeting) => {
    expect(greetingFor(at(hour, minute))).toBe(greeting);
  });

  it('uses the hour of Guatemala, not the one of the browser', () => {
    // 03:00 UTC is 21:00 of the previous day in Guatemala.
    expect(greetingFor(at(3))).toBe('Buenas noches');
  });
});

describe('longDayHeading', () => {
  it('names the weekday, the day and the month in Spanish', () => {
    expect(longDayHeading('2026-10-05')).toBe('Lunes 5 de octubre');
    expect(longDayHeading('2026-11-01')).toBe('Domingo 1 de noviembre');
  });
});
