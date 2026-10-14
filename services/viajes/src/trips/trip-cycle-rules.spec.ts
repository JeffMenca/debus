import {
  EARLY_DEPARTURE_TOLERANCE_MS,
  EVENT_AMOUNT_MAX,
  MAX_TRIP_DISTANCE_KM,
} from '@debus/contracts';
import {
  arrivalProblem,
  costsProblem,
  deletionProblem,
  departureProblem,
  driverPayFor,
  tripCosts,
} from './trip-cycle-rules';

const now = new Date('2026-10-20T12:00:00.000Z');
const departure = {
  status: 'SCHEDULED' as const,
  busActive: true,
  driverActive: true,
  busOnAnotherTrip: false,
  driverOnAnotherTrip: false,
  busMileageKm: 148000,
  startMileageKm: 148410,
  departedAt: '2026-10-20T11:34:00.000Z',
  scheduledAt: new Date('2026-10-20T11:30:00.000Z'),
  now,
};

describe('departureProblem', () => {
  it('lets a scheduled trip with active bus and driver leave', () => {
    expect(departureProblem(departure)).toBeNull();
  });

  it.each([
    [{ status: 'IN_TRANSIT' as const }, 'alreadyDeparted'],
    [{ status: 'COMPLETED' as const }, 'alreadyDeparted'],
    [{ busActive: false }, 'departureBusInactive'],
    [{ driverActive: false }, 'departureDriverInactive'],
    [{ busOnAnotherTrip: true }, 'busOnAnotherTrip'],
    [{ driverOnAnotherTrip: true }, 'driverOnAnotherTrip'],
    // a deactivated bus is explained before the other trip
    [{ busActive: false, busOnAnotherTrip: true }, 'departureBusInactive'],
    [{ driverActive: false, driverOnAnotherTrip: true }, 'departureDriverInactive'],
    // the other trip is explained before the mileage
    [{ busOnAnotherTrip: true, startMileageKm: 1 }, 'busOnAnotherTrip'],
    [{ driverOnAnotherTrip: true, startMileageKm: 1 }, 'driverOnAnotherTrip'],
    [{ busOnAnotherTrip: true, driverOnAnotherTrip: true }, 'busOnAnotherTrip'],
    [{ startMileageKm: 147999 }, 'startMileageBelowBus'],
    [{ departedAt: '2026-10-20T12:06:00.000Z' }, 'departureInFuture'],
  ])('refuses %o with %s', (change, problem) => {
    expect(departureProblem({ ...departure, ...change })).toBe(problem);
  });

  it('refuses a departure more than twelve hours before the scheduled time', () => {
    const scheduledAt = new Date(now.getTime() + EARLY_DEPARTURE_TOLERANCE_MS);
    const early = (ms: number) =>
      departureProblem({
        ...departure,
        scheduledAt,
        departedAt: new Date(scheduledAt.getTime() - ms).toISOString(),
      });

    expect(EARLY_DEPARTURE_TOLERANCE_MS).toBe(12 * 3_600_000);
    expect(early(EARLY_DEPARTURE_TOLERANCE_MS + 60_000)).toBe('departureTooEarly');
    expect(early(EARLY_DEPARTURE_TOLERANCE_MS)).toBeNull();
  });

  it('accepts a departure up to five minutes ahead of the server clock', () => {
    expect(departureProblem({ ...departure, departedAt: '2026-10-20T12:04:59.000Z' })).toBeNull();
  });
});

const arrival = {
  status: 'IN_TRANSIT' as const,
  departedAt: new Date('2026-10-20T07:34:00.000Z'),
  startMileageKm: 148410,
  arrivedAt: '2026-10-20T11:52:00.000Z',
  endMileageKm: 148614,
  now,
};

describe('arrivalProblem', () => {
  it('lets a trip on the road arrive', () => {
    expect(arrivalProblem(arrival)).toBeNull();
  });

  it.each([
    [{ status: 'SCHEDULED' as const }, 'notOnTheRoad'],
    [{ status: 'COMPLETED' as const }, 'alreadyArrived'],
    [{ arrivedAt: '2026-10-20T07:34:00.000Z' }, 'arrivalBeforeDeparture'],
    [{ arrivedAt: '2026-10-20T12:06:00.000Z' }, 'arrivalInFuture'],
    [{ endMileageKm: 148409 }, 'endMileageBelowStart'],
    [{ endMileageKm: 148410 + MAX_TRIP_DISTANCE_KM + 1 }, 'distanceTooLong'],
  ])('refuses %o with %s', (change, problem) => {
    expect(arrivalProblem({ ...arrival, ...change })).toBe(problem);
  });
});

describe('arrivalProblem distance', () => {
  it('accepts a trip as long as the limit', () => {
    expect(
      arrivalProblem({ ...arrival, endMileageKm: arrival.startMileageKm + MAX_TRIP_DISTANCE_KM }),
    ).toBeNull();
  });
});

describe('costsProblem', () => {
  it('refuses a depreciation the event could not carry', () => {
    expect(costsProblem({ depreciationAmount: EVENT_AMOUNT_MAX + 0.01 })).toBe(
      'depreciationTooHigh',
    );
    expect(costsProblem({ depreciationAmount: EVENT_AMOUNT_MAX })).toBeNull();
  });
});

describe('tripCosts', () => {
  it('multiplies the kilometres by the amount in force and rounds to cents', () => {
    expect(
      tripCosts({
        type: 'REGULAR',
        startMileageKm: 148410,
        endMileageKm: 148614,
        depreciationPerKm: 0.85,
        baseSalary: 250,
      }),
    ).toEqual({ distanceKm: 204, depreciationAmount: 173.4, driverPay: 250 });
  });

  it('rounds half a cent up', () => {
    expect(
      tripCosts({
        type: 'REGULAR',
        startMileageKm: 0,
        endMileageKm: 3,
        depreciationPerKm: 0.335,
        baseSalary: 1,
      }).depreciationAmount,
    ).toBe(1.01);
  });

  it('gives zero depreciation to a trip that did not move', () => {
    expect(
      tripCosts({
        type: 'REGULAR',
        startMileageKm: 10,
        endMileageKm: 10,
        depreciationPerKm: 2,
        baseSalary: 1,
      }).depreciationAmount,
    ).toBe(0);
  });
});

describe('driverPayFor', () => {
  it('pays the base salary on a regular trip', () => {
    expect(driverPayFor('REGULAR', 250)).toBe(250);
  });

  it('pays 15% more on a rental, rounded to cents', () => {
    expect(driverPayFor('RENTAL', 250)).toBe(287.5);
    expect(driverPayFor('RENTAL', 333.33)).toBe(383.33);
    // 1.10 x 1.15 is 1.265 in the head but 1.2649999... in floating point.
    expect(driverPayFor('RENTAL', 1.1)).toBe(1.27);
  });
});

describe('deletionProblem', () => {
  it('lets only a trip that has not left be deleted', () => {
    expect(deletionProblem('SCHEDULED')).toBeNull();
    expect(deletionProblem('IN_TRANSIT')).toBe('tripStarted');
    expect(deletionProblem('COMPLETED')).toBe('tripStarted');
  });
});
