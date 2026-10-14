import { exampleTripScheduled, tripDetailSchema } from '@debus/contracts';
import { Prisma } from '../generated/prisma/client';
import { type TripWithRecords, toTripDetail } from './trip-detail';

const base: TripWithRecords = {
  id: exampleTripScheduled.tripId,
  type: 'REGULAR',
  status: 'SCHEDULED',
  branchId: exampleTripScheduled.branchId,
  routeId: exampleTripScheduled.routeId,
  busId: exampleTripScheduled.busId,
  busPlate: 'C482BTX',
  capacity: 40,
  driverId: exampleTripScheduled.driverId,
  driverName: 'Julio Pérez',
  originLabel: 'Quetzaltenango',
  destinationLabel: 'Guatemala',
  departureAt: new Date(exampleTripScheduled.departureAt),
  estimatedArrivalAt: new Date(exampleTripScheduled.estimatedArrivalAt),
  ticketPrice: new Prisma.Decimal('85.00'),
  rentalId: null,
  createdById: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  searchText: '',
  createdAt: new Date(),
  updatedAt: new Date(),
  departure: null,
  arrival: null,
};
const context = {
  bus: { active: false, mileageKm: 148000 },
  driver: { active: true, baseSalary: 250 },
  distanceKm: 201,
  depreciationPerKmToday: 0.85,
};

describe('toTripDetail', () => {
  it('shows a trip that has not left with the values the screen suggests', () => {
    const detail = toTripDetail(base, context);

    expect(detail).toMatchObject({
      busActive: false,
      driverActive: true,
      distanceKm: 201,
      suggestedStartMileageKm: 148000,
      depreciationPerKmToday: 0.85,
      expectedDriverPay: 250,
      canDelete: true,
      departure: null,
      arrival: null,
    });
    expect(tripDetailSchema.parse(detail)).toEqual(detail);
  });

  it('pays a rental driver 15% more', () => {
    expect(toTripDetail({ ...base, type: 'RENTAL' }, context).expectedDriverPay).toBe(287.5);
  });

  it('shows both records as plain numbers and refuses to delete a completed trip', () => {
    const detail = toTripDetail(
      {
        ...base,
        status: 'COMPLETED',
        departure: {
          tripId: base.id,
          departedAt: new Date('2026-10-20T11:34:00.000Z'),
          startMileageKm: 148410,
          recordedById: base.createdById,
          recordedByRole: 'BRANCH_ADMIN',
          createdAt: new Date(),
        },
        arrival: {
          tripId: base.id,
          arrivedAt: new Date('2026-10-20T15:50:00.000Z'),
          endMileageKm: 148614,
          fuelCost: new Prisma.Decimal('1180.00'),
          distanceKm: 204,
          depreciationPerKm: new Prisma.Decimal('0.85'),
          depreciationAmount: new Prisma.Decimal('173.40'),
          driverPay: new Prisma.Decimal('250.00'),
          settingsVersionId: base.createdById,
          recordedById: base.createdById,
          recordedByRole: 'DRIVER',
          createdAt: new Date(),
        },
      },
      context,
    );

    expect(detail.canDelete).toBe(false);
    expect(detail.departure).toEqual({
      departedAt: '2026-10-20T11:34:00.000Z',
      startMileageKm: 148410,
      recordedByRole: 'BRANCH_ADMIN',
    });
    expect(detail.arrival).toEqual({
      arrivedAt: '2026-10-20T15:50:00.000Z',
      endMileageKm: 148614,
      fuelCost: 1180,
      distanceKm: 204,
      depreciationPerKm: 0.85,
      depreciationAmount: 173.4,
      driverPay: 250,
      recordedByRole: 'DRIVER',
    });
    expect(tripDetailSchema.parse(detail)).toEqual(detail);
  });

  it('treats a bus or a driver without a copy as inactive', () => {
    const detail = toTripDetail(base, {
      bus: null,
      driver: null,
      distanceKm: null,
      depreciationPerKmToday: null,
    });

    expect(detail).toMatchObject({
      busActive: false,
      driverActive: false,
      suggestedStartMileageKm: 0,
      expectedDriverPay: 0,
      distanceKm: null,
      depreciationPerKmToday: null,
    });
  });
});
