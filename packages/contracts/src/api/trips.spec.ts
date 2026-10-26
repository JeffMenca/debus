import { MILEAGE_MAX_KM } from './fleet';
import {
  assignRentalRequestSchema,
  recordArrivalRequestSchema,
  recordDepartureRequestSchema,
  rentalRequestListQuerySchema,
  saleStatusSchema,
  scheduleTripRequestSchema,
  tripDetailSchema,
  tripListQuerySchema,
} from './trips';

const ids = () => ({
  routeId: crypto.randomUUID(),
  busId: crypto.randomUUID(),
  driverId: crypto.randomUUID(),
});

describe('trip contracts', () => {
  it('needs the estimated arrival after the departure', () => {
    const departureAt = '2026-10-20T12:00:00.000Z';
    expect(
      scheduleTripRequestSchema.safeParse({
        ...ids(),
        departureAt,
        estimatedArrivalAt: '2026-10-20T16:00:00.000Z',
      }).success,
    ).toBe(true);
    expect(
      scheduleTripRequestSchema.safeParse({
        ...ids(),
        departureAt,
        estimatedArrivalAt: departureAt,
      }).success,
    ).toBe(false);
  });

  it('compares the arrival and the departure as instants, whatever their precision', () => {
    const request = (departureAt: string, estimatedArrivalAt: string) =>
      scheduleTripRequestSchema.safeParse({ ...ids(), departureAt, estimatedArrivalAt }).success;

    expect(request('2026-10-20T10:00:00.500Z', '2026-10-20T10:00:00Z')).toBe(false);
    expect(request('2026-10-20T10:00:00Z', '2026-10-20T10:00:00.000Z')).toBe(false);
    expect(request('2026-10-20T10:00:00.500Z', '2026-10-20T10:00:01Z')).toBe(true);
  });

  it('filters trips by day range and status with pages', () => {
    expect(tripListQuerySchema.parse({ from: '2026-10-20', to: '2026-10-21' })).toEqual({
      from: '2026-10-20',
      to: '2026-10-21',
      status: 'all',
      page: 1,
      pageSize: 20,
    });
    expect(tripListQuerySchema.safeParse({ from: '2026-10-22', to: '2026-10-21' }).success).toBe(
      false,
    );
  });

  it('explains why a trip is closed for sale', () => {
    expect(
      saleStatusSchema.parse({ tripId: crypto.randomUUID(), open: false, reason: 'DEPARTED' }),
    ).toMatchObject({ open: false, reason: 'DEPARTED' });
  });
});

describe('trip cycle requests', () => {
  it('accepts a departure with its real time and starting mileage', () => {
    expect(
      recordDepartureRequestSchema.parse({
        departedAt: '2026-10-20T11:34:00.000Z',
        startMileageKm: 148410,
      }),
    ).toEqual({ departedAt: '2026-10-20T11:34:00.000Z', startMileageKm: 148410 });
  });

  it('refuses a mileage above the fleet maximum or with decimals', () => {
    for (const startMileageKm of [MILEAGE_MAX_KM + 1, 10.5, -1]) {
      expect(
        recordDepartureRequestSchema.safeParse({
          departedAt: '2026-10-20T11:34:00.000Z',
          startMileageKm,
        }).success,
      ).toBe(false);
    }
  });

  it('accepts an arrival with fuel cost in quetzales and refuses a negative one', () => {
    const base = { arrivedAt: '2026-10-20T15:52:00.000Z', endMileageKm: 148614 };
    expect(recordArrivalRequestSchema.safeParse({ ...base, fuelCost: 1180 }).success).toBe(true);
    expect(recordArrivalRequestSchema.safeParse({ ...base, fuelCost: -1 }).success).toBe(false);
  });

  it('describes a completed trip with its fixed amounts', () => {
    const detail = tripDetailSchema.parse({
      id: '4c3d2e1f-7a6b-4c5d-8e9f-0a1b2c3d4e5f',
      type: 'REGULAR',
      status: 'COMPLETED',
      branchId: '9b2c7a10-1111-4c4c-8888-123456789abc',
      routeId: null,
      originName: 'Quetzaltenango',
      destinationName: 'Guatemala',
      busId: '1f0e2d3c-4b5a-4968-8776-655443322110',
      busPlate: 'C482BTX',
      driverId: '2a1b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
      driverName: 'Julio Pérez',
      departureAt: '2026-10-20T11:30:00.000Z',
      estimatedArrivalAt: '2026-10-20T15:45:00.000Z',
      ticketPrice: 85,
      capacity: 40,
      departedAt: '2026-10-20T11:34:00.000Z',
      distanceKm: 201,
      busActive: true,
      driverActive: true,
      suggestedStartMileageKm: 148410,
      depreciationPerKmToday: 0.85,
      expectedDriverPay: 250,
      canDelete: false,
      departure: {
        departedAt: '2026-10-20T11:34:00.000Z',
        startMileageKm: 148410,
        recordedByRole: 'BRANCH_ADMIN',
      },
      arrival: {
        arrivedAt: '2026-10-20T15:52:00.000Z',
        endMileageKm: 148614,
        fuelCost: 1180,
        distanceKm: 204,
        depreciationPerKm: 0.85,
        depreciationAmount: 173.4,
        driverPay: 250,
        recordedByRole: 'DRIVER',
      },
    });
    expect(detail.arrival?.depreciationAmount).toBe(173.4);
  });
});

describe('rental requests', () => {
  it('lists pending requests by default', () => {
    expect(rentalRequestListQuerySchema.parse({})).toMatchObject({
      status: 'PENDING',
      page: 1,
      pageSize: 20,
    });
  });

  it('can list the cancelled ones too', () => {
    expect(rentalRequestListQuerySchema.parse({ status: 'CANCELLED' }).status).toBe('CANCELLED');
  });

  it('asks for bus, driver and an estimated arrival to assign one', () => {
    expect(
      assignRentalRequestSchema.safeParse({
        busId: '1f0e2d3c-4b5a-4968-8776-655443322110',
        driverId: '2a1b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
        estimatedArrivalAt: '2026-10-24T22:00:00.000Z',
      }).success,
    ).toBe(true);
  });
});
