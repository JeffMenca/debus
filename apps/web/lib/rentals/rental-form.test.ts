import { BRANCH_ID } from '../../test-support/rentals';
import {
  type RentalDraft,
  counterRequestFrom,
  emptyRentalDraft,
  parseDistance,
  rentalRequestFrom,
} from './rental-form';

const CLIENT_ID = '7d6c5b4a-3f2e-4d1c-8b0a-9f8e7d6c5b4a';

const draft = (over: Partial<RentalDraft> = {}): RentalDraft => ({
  ...emptyRentalDraft('2026-10-21'),
  branchId: BRANCH_ID,
  origin: 'Quetzaltenango',
  destination: 'Panajachel',
  departureDay: '2026-10-24',
  departureTime: '07:00',
  passengers: '35',
  distance: '92',
  ...over,
});
const NOW = new Date('2026-10-21T15:00:00.000Z');

describe('rentalRequestFrom', () => {
  it('builds the request with the hours of Guatemala', () => {
    expect(rentalRequestFrom(draft(), NOW)).toEqual({
      request: {
        branchId: BRANCH_ID,
        originLabel: 'Quetzaltenango',
        destinationLabel: 'Panajachel',
        departureAt: '2026-10-24T13:00:00.000Z',
        returnAt: null,
        passengers: 35,
        distanceKm: 92,
      },
    });
  });

  it('adds the return of a round trip', () => {
    const result = rentalRequestFrom(
      draft({ roundTrip: true, returnDay: '2026-10-24', returnTime: '17:00' }),
      NOW,
    );

    expect(result.request?.returnAt).toBe('2026-10-24T23:00:00.000Z');
  });

  it('says what is missing or wrong, in plain words', () => {
    const result = rentalRequestFrom(
      draft({
        branchId: '',
        origin: ' ',
        destination: '',
        departureDay: '2026-10-20',
        passengers: '0',
        distance: 'mucho',
        roundTrip: true,
        returnDay: '2026-10-19',
        returnTime: '06:00',
      }),
      NOW,
    );

    expect(result.request).toBeUndefined();
    expect(result.problems).toEqual({
      branchId: 'Elige la sucursal que te atenderá.',
      origin: 'Escribe de dónde salen.',
      destination: 'Escribe a dónde van.',
      departure: 'La salida debe ser en el futuro.',
      passengers: 'Escribe cuántas personas viajan, de 1 a 200.',
      distance: 'Escribe los kilómetros aproximados, por ejemplo 92 o 92.5.',
      return: 'El regreso debe ser después de la salida.',
    });
  });

  it('asks for the return hour when it is a round trip', () => {
    expect(rentalRequestFrom(draft({ roundTrip: true }), NOW).problems).toEqual({
      return: 'Elige el día y la hora del regreso.',
    });
  });
});

describe('counterRequestFrom', () => {
  const counter = { clientId: CLIENT_ID, price: '2,600' };

  it('takes the chosen client and the price written at the counter', () => {
    expect(counterRequestFrom(draft(), counter, NOW).request).toMatchObject({
      clientId: CLIENT_ID,
      price: 2600,
    });
  });

  it('asks to choose the client and the departments, and checks the price', () => {
    const result = counterRequestFrom(
      draft({ origin: '', destination: '' }),
      { clientId: '', price: '0' },
      NOW,
    );

    expect(result.problems).toEqual({
      origin: 'Elige el departamento de salida.',
      destination: 'Elige el departamento de destino.',
      clientId: 'Elige al cliente que alquila.',
      price: 'Escribe un precio mayor a Q 0.',
    });
  });
});

it('reads a distance with one decimal at most', () => {
  expect(parseDistance('92.5')).toBe(92.5);
  expect(parseDistance('92.55')).toBeNull();
  expect(parseDistance('')).toBeNull();
});
