import { BRANCH_ID } from '../../test-support/rentals';
import {
  type RentalDraft,
  counterRequestFrom,
  emptyRentalDraft,
  parseDistance,
  rentalRequestFrom,
} from './rental-form';

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
  const counter = { nit: '', clientName: 'Colegio San José', email: '', price: '2,600' };

  it('takes the final consumer, no email and the price written at the counter', () => {
    expect(counterRequestFrom(draft(), counter, NOW).request).toMatchObject({
      nit: 'CF',
      clientName: 'Colegio San José',
      email: null,
      price: 2600,
    });
  });

  it('checks the client, the email and the price too', () => {
    const result = counterRequestFrom(
      draft(),
      { nit: '12-A', clientName: '', email: 'no', price: '0' },
      NOW,
    );

    expect(result.problems).toEqual({
      nit: 'Escribe un NIT válido o déjalo vacío para consumidor final.',
      clientName: 'Escribe el nombre del cliente.',
      email: 'Escribe un correo válido o déjalo vacío.',
      price: 'Escribe un precio mayor a Q 0.',
    });
  });
});

it('reads a distance with one decimal at most', () => {
  expect(parseDistance('92.5')).toBe(92.5);
  expect(parseDistance('92.55')).toBeNull();
  expect(parseDistance('')).toBeNull();
});
