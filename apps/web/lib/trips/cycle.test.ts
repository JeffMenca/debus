import { MAX_TRIP_DISTANCE_KM, guatemalaDateTime } from '@debus/contracts';
import {
  CYCLE_PROBLEMS,
  arrivalPreview,
  arrivalRequestFrom,
  departureRequestFrom,
  formatMoment,
  nowInGuatemala,
} from './cycle';

describe('arrivalPreview', () => {
  it('shows the distance, the depreciation and the pay before saving', () => {
    expect(
      arrivalPreview({
        startMileageKm: 148410,
        endMileageKm: 148614,
        depreciationPerKm: 0.85,
        expectedDriverPay: 250,
      }),
    ).toEqual({ distanceKm: 204, depreciationAmount: 173.4, driverPay: 250 });
  });

  it('shows nothing while the final mileage is missing or below the start', () => {
    expect(
      arrivalPreview({
        startMileageKm: 10,
        endMileageKm: null,
        depreciationPerKm: 1,
        expectedDriverPay: 1,
      }).distanceKm,
    ).toBeNull();
    expect(
      arrivalPreview({
        startMileageKm: 10,
        endMileageKm: 5,
        depreciationPerKm: 1,
        expectedDriverPay: 1,
      }).distanceKm,
    ).toBeNull();
  });

  it('shows nothing for a distance no trip could cover, but still the pay', () => {
    const preview = (distance: number) =>
      arrivalPreview({
        startMileageKm: 100,
        endMileageKm: 100 + distance,
        depreciationPerKm: 1.5,
        expectedDriverPay: 250,
      });

    expect(preview(MAX_TRIP_DISTANCE_KM + 1)).toEqual({
      distanceKm: null,
      depreciationAmount: null,
      driverPay: 250,
    });
    expect(preview(MAX_TRIP_DISTANCE_KM).distanceKm).toBe(MAX_TRIP_DISTANCE_KM);
  });

  it('leaves the depreciation empty when no rate is configured', () => {
    expect(
      arrivalPreview({
        startMileageKm: 0,
        endMileageKm: 5,
        depreciationPerKm: null,
        expectedDriverPay: 1,
      }).depreciationAmount,
    ).toBeNull();
  });

  it('rounds the depreciation to cents', () => {
    expect(
      arrivalPreview({
        startMileageKm: 0,
        endMileageKm: 3,
        depreciationPerKm: 0.335,
        expectedDriverPay: 1,
      }).depreciationAmount,
    ).toBe(1.01);
  });
});

describe('nowInGuatemala', () => {
  it('gives the day and minute in Guatemala time', () => {
    expect(nowInGuatemala(new Date('2026-10-21T03:15:40Z'))).toEqual({
      day: '2026-10-20',
      time: '21:15',
    });
  });

  it('writes midnight as 00:00', () => {
    expect(nowInGuatemala(new Date('2026-10-21T06:00:10Z'))).toEqual({
      day: '2026-10-21',
      time: '00:00',
    });
  });

  it('uses the current time when none is given', () => {
    expect(nowInGuatemala().time).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe('formatMoment', () => {
  it('writes the Guatemalan day and hour the way the records show them', () => {
    expect(formatMoment('2026-10-20T11:34:00.000Z')).toBe('20/10/2026 05:34');
  });
});

describe('departureRequestFrom', () => {
  it('builds the request with the Guatemalan hour as an instant', () => {
    expect(departureRequestFrom({ day: '2026-10-20', time: '05:34', mileage: '148,410' })).toEqual({
      request: {
        departedAt: guatemalaDateTime('2026-10-20', '05:34'),
        startMileageKm: 148410,
      },
    });
  });

  it('lists what is missing or wrong', () => {
    expect(departureRequestFrom({ day: '', time: '', mileage: 'x' })).toEqual({
      problems: {
        day: CYCLE_PROBLEMS.departureDay,
        time: CYCLE_PROBLEMS.departureTime,
        mileage: CYCLE_PROBLEMS.startMileage,
      },
    });
  });

  it('refuses a departure more than twelve hours before the scheduled time, as the server does', () => {
    const values = { day: '2026-10-20', time: '05:34', mileage: '148410' };
    const scheduledAt = (hoursAhead: number) =>
      new Date(
        Date.parse(guatemalaDateTime('2026-10-20', '05:34')) + hoursAhead * 3_600_000,
      ).toISOString();

    expect(departureRequestFrom(values, scheduledAt(13)).problems).toEqual({
      day: CYCLE_PROBLEMS.departureTooEarly,
    });
    expect(departureRequestFrom(values, scheduledAt(12)).request).toBeDefined();
  });

  it('refuses a mileage above the fleet maximum', () => {
    expect(
      departureRequestFrom({ day: '2026-10-20', time: '05:34', mileage: '5000001' }).problems,
    ).toEqual({ mileage: CYCLE_PROBLEMS.startMileage });
  });
});

describe('arrivalRequestFrom', () => {
  const departure = { startMileageKm: 148410, departedAt: '2026-10-20T11:34:00.000Z' };
  const values = { day: '2026-10-20', time: '09:52', mileage: '148614', fuel: '1,180.50' };

  it('builds the request with fuel in quetzales', () => {
    expect(arrivalRequestFrom(values, departure)).toEqual({
      request: {
        arrivedAt: guatemalaDateTime('2026-10-20', '09:52'),
        endMileageKm: 148614,
        fuelCost: 1180.5,
      },
    });
  });

  it('lists every missing value', () => {
    expect(arrivalRequestFrom({ day: '', time: '', mileage: '', fuel: '' }, departure)).toEqual({
      problems: {
        day: CYCLE_PROBLEMS.arrivalDay,
        time: CYCLE_PROBLEMS.arrivalTime,
        mileage: CYCLE_PROBLEMS.endMileage,
        fuel: CYCLE_PROBLEMS.fuel,
      },
    });
  });

  it('refuses a mileage below the starting one and an arrival before the departure', () => {
    expect(
      arrivalRequestFrom({ ...values, mileage: '148000', time: '05:00' }, departure).problems,
    ).toEqual({
      mileage: CYCLE_PROBLEMS.endMileageBelow(148410),
      time: CYCLE_PROBLEMS.arrivalOrder,
    });
  });

  it('refuses an arrival in the same minute as the departure, as the server does', () => {
    expect(arrivalRequestFrom({ ...values, time: '05:34' }, departure).problems).toEqual({
      time: CYCLE_PROBLEMS.arrivalOrder,
    });
    expect(arrivalRequestFrom({ ...values, time: '05:35' }, departure).problems).toBeUndefined();
  });

  it('refuses a distance longer than any trip could cover', () => {
    const farthest = departure.startMileageKm + MAX_TRIP_DISTANCE_KM;

    expect(
      arrivalRequestFrom({ ...values, mileage: String(farthest + 1) }, departure).problems,
    ).toEqual({ mileage: CYCLE_PROBLEMS.distanceTooLong });
    expect(
      arrivalRequestFrom({ ...values, mileage: String(farthest) }, departure).problems,
    ).toBeUndefined();
  });

  it('refuses a fuel cost of zero', () => {
    expect(arrivalRequestFrom({ ...values, fuel: '0' }, departure).problems).toEqual({
      fuel: CYCLE_PROBLEMS.fuel,
    });
  });
});
