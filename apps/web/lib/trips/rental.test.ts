import { guatemalaDateTime } from '@debus/contracts';
import { rentalRequest } from '../../test-support/trips';
import {
  ASSIGN_PROBLEMS,
  assignClashFieldOf,
  assignRequestFrom,
  defaultRentalArrival,
} from './rental';

describe('defaultRentalArrival', () => {
  beforeAll(() => jest.useFakeTimers({ now: new Date('2026-10-20T12:00:00.000Z') }));
  afterAll(() => jest.useRealTimers());

  it('proposes the return of the client when there is one', () => {
    // 22:00Z is 16:00 in Guatemala
    expect(defaultRentalArrival(rentalRequest())).toEqual({ day: '2026-10-24', time: '16:00' });
  });

  it('proposes four hours after the departure for a one-way rental', () => {
    // 12:00Z is 06:00 in Guatemala
    expect(defaultRentalArrival(rentalRequest({ returnAt: null }))).toEqual({
      day: '2026-10-24',
      time: '10:00',
    });
  });
});

describe('defaultRentalArrival of a late rental', () => {
  beforeAll(() => jest.useFakeTimers({ now: new Date('2026-10-25T12:00:00.000Z') }));
  afterAll(() => jest.useRealTimers());

  it('proposes four hours from now when the usual proposal already passed', () => {
    // 12:00Z is 06:00 in Guatemala, so 16:00Z is 10:00
    expect(defaultRentalArrival(rentalRequest())).toEqual({ day: '2026-10-25', time: '10:00' });
  });
});

describe('assignRequestFrom', () => {
  // The service refuses an arrival that already passed: the clock is fixed to the day before.
  beforeAll(() => jest.useFakeTimers({ now: new Date('2026-10-23T12:00:00.000Z') }));
  afterAll(() => jest.useRealTimers());

  const values = {
    busId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    driverId: '0b1f1f2e-5c2d-4a8e-9e51-6f3f7a6f3a11',
    arrival: { day: '2026-10-24', time: '16:00' },
  };

  it('builds the request with the Guatemalan arrival as an instant', () => {
    expect(assignRequestFrom(values, rentalRequest())).toEqual({
      request: {
        busId: values.busId,
        driverId: values.driverId,
        estimatedArrivalAt: guatemalaDateTime('2026-10-24', '16:00'),
      },
    });
  });

  it('lists what is missing', () => {
    expect(
      assignRequestFrom(
        { busId: '', driverId: '', arrival: { day: '', time: '' } },
        rentalRequest(),
      ),
    ).toEqual({
      problems: {
        busId: ASSIGN_PROBLEMS.busId,
        driverId: ASSIGN_PROBLEMS.driverId,
        arrivalDay: ASSIGN_PROBLEMS.arrivalDay,
        arrivalTime: ASSIGN_PROBLEMS.arrivalTime,
      },
    });
  });

  it('refuses an arrival that is not after the departure', () => {
    expect(
      assignRequestFrom(
        { ...values, arrival: { day: '2026-10-24', time: '05:00' } },
        rentalRequest(),
      ).problems,
    ).toEqual({ arrivalTime: ASSIGN_PROBLEMS.arrivalOrder });
  });

  it('refuses an arrival before the return of a round trip, as the service does', () => {
    const roundTrip = rentalRequest({ returnAt: '2026-10-24T22:00:00.000Z' });

    expect(
      assignRequestFrom({ ...values, arrival: { day: '2026-10-24', time: '15:59' } }, roundTrip)
        .problems,
    ).toEqual({ arrivalTime: ASSIGN_PROBLEMS.arrivalBeforeReturn });
    expect(
      assignRequestFrom({ ...values, arrival: { day: '2026-10-24', time: '16:00' } }, roundTrip)
        .problems,
    ).toBeUndefined();
  });

  it('refuses an arrival that already passed, but not a late rental whose arrival is ahead', () => {
    const late = rentalRequest({
      departureAt: '2026-10-23T10:00:00.000Z',
      returnAt: null,
    });

    expect(
      assignRequestFrom({ ...values, arrival: { day: '2026-10-23', time: '05:00' } }, late)
        .problems,
    ).toEqual({ arrivalTime: ASSIGN_PROBLEMS.arrivalInPast });
    expect(
      assignRequestFrom({ ...values, arrival: { day: '2026-10-23', time: '10:00' } }, late)
        .problems,
    ).toBeUndefined();
  });

  it('does not ask for a return a one-way rental does not have', () => {
    expect(assignRequestFrom(values, rentalRequest({ returnAt: null })).problems).toBeUndefined();
  });
});

describe('assignClashFieldOf', () => {
  it.each([
    ['Ese bus ya tiene un viaje en ese horario.', 'bus'],
    ['Ese bus tiene menos asientos que pasajeros del alquiler.', 'bus'],
    ['Ese chofer ya tiene un viaje en ese horario.', 'driver'],
    ['La licencia de ese chofer estará vencida el día del viaje.', 'driver'],
    ['La llegada estimada debe ser después de la salida del alquiler.', 'arrival'],
    ['La llegada estimada no puede ser antes del regreso del cliente.', 'arrival'],
    ['La llegada estimada ya pasó. Elige una llegada que todavía no haya ocurrido.', 'arrival'],
    ['El servicio no respondió. Intenta de nuevo en unos segundos.', null],
    ['Ese alquiler ya tiene bus y chofer.', null],
  ])('puts "%s" next to %s', (message, field) => {
    expect(assignClashFieldOf(message)).toBe(field);
  });
});
