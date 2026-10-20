import {
  dayChip,
  readTripSearch,
  stripStart,
  toTripListQuery,
  weekStrip,
  writeTripSearch,
} from './trip-search-params';

const TODAY = '2026-10-20';
const read = (search: string) => readTripSearch(new URLSearchParams(search), TODAY);
const write = (query: Parameters<typeof writeTripSearch>[0]) =>
  writeTripSearch(query, TODAY).toString();

describe('readTripSearch', () => {
  it('starts on today, one passenger, anywhere and the first page', () => {
    expect(read('')).toEqual({ date: TODAY, passengers: 1, page: 1, pageSize: 20 });
  });

  it('reads the places, the day, the passengers and the page in Spanish', () => {
    expect(
      read(
        'origen=Quetzaltenango&destino=Ciudad+de+Guatemala&fecha=2026-10-25&pasajeros=3&pagina=2',
      ),
    ).toEqual({
      origin: 'Quetzaltenango',
      destination: 'Ciudad de Guatemala',
      date: '2026-10-25',
      passengers: 3,
      page: 2,
      pageSize: 20,
    });
  });

  it('sends each strange value back to its default on its own', () => {
    expect(read(`origen=%20%20&destino=${'x'.repeat(121)}&fecha=ayer&pasajeros=11`)).toEqual({
      date: TODAY,
      passengers: 1,
      page: 1,
      pageSize: 20,
    });
    expect(read('pasajeros=0').passengers).toBe(1);
    expect(read('pasajeros=2.5').passengers).toBe(1);
  });
});

describe('writeTripSearch', () => {
  it('leaves the defaults out of the address', () => {
    expect(write({ date: TODAY, passengers: 1, page: 1, pageSize: 20 })).toBe('');
  });

  it('writes what changed, in Spanish', () => {
    expect(
      write({
        origin: 'Quetzaltenango',
        destination: 'Flores',
        date: '2026-10-25',
        passengers: 2,
        page: 3,
        pageSize: 50,
      }),
    ).toBe('origen=Quetzaltenango&destino=Flores&fecha=2026-10-25&pasajeros=2&pagina=3&mostrar=50');
  });
});

describe('toTripListQuery', () => {
  it('asks for the whole chosen day and only the places that were chosen', () => {
    expect(toTripListQuery({ date: TODAY, passengers: 1, page: 2, pageSize: 20 })).toEqual({
      from: TODAY,
      to: TODAY,
      page: 2,
      pageSize: 20,
    });
  });

  it('asks for room for the passengers only when there is more than one, so sold out trips still show', () => {
    expect(
      toTripListQuery({
        origin: 'Quetzaltenango',
        destination: 'Flores',
        date: TODAY,
        passengers: 3,
        page: 1,
        pageSize: 20,
      }),
    ).toEqual({
      from: TODAY,
      to: TODAY,
      origin: 'Quetzaltenango',
      destination: 'Flores',
      seats: 3,
      page: 1,
      pageSize: 20,
    });
  });
});

describe('weekStrip', () => {
  it('offers six days from the chosen one, across the end of a month', () => {
    expect(weekStrip('2026-10-29')).toEqual([
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
      '2026-11-03',
    ]);
  });
});

describe('stripStart', () => {
  it('keeps the strip on this week while the chosen day is in it', () => {
    expect(stripStart('2026-10-20', TODAY)).toBe(TODAY);
    expect(stripStart('2026-10-25', TODAY)).toBe(TODAY);
  });

  it('starts the strip on the chosen day when it is further away or already past', () => {
    expect(stripStart('2026-10-26', TODAY)).toBe('2026-10-26');
    expect(stripStart('2026-10-01', TODAY)).toBe('2026-10-01');
  });
});

describe('dayChip', () => {
  it('names the day of the week and its number', () => {
    expect(dayChip('2026-10-19')).toEqual({
      weekday: 'Lun',
      day: '19',
      label: 'lunes 19 de octubre',
    });
    expect(dayChip('2026-10-24').weekday).toBe('Sáb');
  });
});
