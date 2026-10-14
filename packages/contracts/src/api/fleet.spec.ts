import {
  availabilityQuerySchema,
  republishBusesQuerySchema,
  busFieldsSchema,
  busListQuerySchema,
  createRouteRequestSchema,
  driverFieldsSchema,
  driverListQuerySchema,
  MILEAGE_MAX_KM,
  normalizePlate,
  plateSchema,
} from './fleet';

const bus = {
  plate: 'c-482 btx',
  brand: 'Volvo',
  model: 'B8R',
  year: 2021,
  capacity: 40,
  mileageKm: 148410,
  operationalStatus: 'AVAILABLE',
  assignedDriverId: null,
};
const driver = {
  fullName: 'Marta Coyoy',
  email: 'Marta@Correo.com',
  phone: '5555-1234',
  licenseNumber: 'A-1234567',
  licenseType: 'A',
  licenseExpiresOn: '2027-03-01',
  baseSalary: 350,
};

describe('fleet contracts', () => {
  it('normalizes a Guatemalan plate', () => {
    expect(normalizePlate(' c-482 btx ')).toBe('C482BTX');
    expect(plateSchema.parse('TC-123ABC')).toBe('TC123ABC');
    expect(plateSchema.safeParse('123').success).toBe(false);
  });

  it('accepts a bus and rejects impossible values', () => {
    expect(busFieldsSchema.parse(bus)).toMatchObject({ plate: 'C482BTX' });
    expect(busFieldsSchema.safeParse({ ...bus, capacity: 5 }).success).toBe(false);
    expect(busFieldsSchema.safeParse({ ...bus, year: 1970 }).success).toBe(false);
    expect(busFieldsSchema.safeParse({ ...bus, year: new Date().getFullYear() + 2 }).success).toBe(
      false,
    );
    expect(busFieldsSchema.safeParse({ ...bus, year: new Date().getFullYear() + 1 }).success).toBe(
      true,
    );
    expect(busFieldsSchema.safeParse({ ...bus, mileageKm: -1 }).success).toBe(false);
  });

  it('accepts a driver and normalizes the email', () => {
    expect(driverFieldsSchema.parse(driver)).toMatchObject({
      email: 'marta@correo.com',
      licenseNumber: 'A1234567',
      phone: '55551234',
    });
    expect(driverFieldsSchema.safeParse({ ...driver, licenseType: 'Z' }).success).toBe(false);
  });

  it('defaults the list filters and pages', () => {
    expect(busListQuerySchema.parse({})).toEqual({ status: 'all', page: 1, pageSize: 20 });
    expect(driverListQuerySchema.parse({ expiringWithinDays: '30' })).toMatchObject({
      status: 'active',
      expiringWithinDays: 30,
    });
    expect(busListQuerySchema.parse({ q: 'Volvó' }).q).toBe('volvo');
  });

  it('accepts a route with one decimal of distance', () => {
    const route = { destinationBranchId: crypto.randomUUID(), distanceKm: 201.5, ticketPrice: 85 };
    expect(createRouteRequestSchema.parse(route)).toEqual(route);
    expect(createRouteRequestSchema.safeParse({ ...route, distanceKm: 0 }).success).toBe(false);
    expect(createRouteRequestSchema.safeParse({ ...route, distanceKm: 1.25 }).success).toBe(false);
  });

  it('requires the arrival after the departure in an availability query', () => {
    const base = {
      branchId: crypto.randomUUID(),
      busId: crypto.randomUUID(),
      driverId: crypto.randomUUID(),
      departureAt: '2026-10-20T12:00:00.000Z',
    };
    expect(
      availabilityQuerySchema.safeParse({ ...base, estimatedArrivalAt: '2026-10-20T15:00:00.000Z' })
        .success,
    ).toBe(true);
    expect(
      availabilityQuerySchema.safeParse({ ...base, estimatedArrivalAt: base.departureAt }).success,
    ).toBe(false);
  });

  it('compares the arrival and the departure of an availability query as instants', () => {
    const base = {
      branchId: crypto.randomUUID(),
      busId: crypto.randomUUID(),
      driverId: crypto.randomUUID(),
    };
    const query = (departureAt: string, estimatedArrivalAt: string) =>
      availabilityQuerySchema.safeParse({ ...base, departureAt, estimatedArrivalAt }).success;

    expect(query('2026-10-20T10:00:00.500Z', '2026-10-20T10:00:00Z')).toBe(false);
    expect(query('2026-10-20T10:00:00Z', '2026-10-20T10:00:00.000Z')).toBe(false);
    expect(query('2026-10-20T10:00:00Z', '2026-10-20T10:00:00.500Z')).toBe(true);
  });
});

describe('mileage limit', () => {
  it('refuses a bus mileage above the one every trip event accepts', () => {
    expect(busFieldsSchema.shape.mileageKm.safeParse(MILEAGE_MAX_KM + 1).success).toBe(false);
    expect(busFieldsSchema.shape.mileageKm.safeParse(MILEAGE_MAX_KM).success).toBe(true);
  });
});

describe('republishBusesQuerySchema', () => {
  it('takes no filter or the id of a branch, and nothing else as the branch', () => {
    expect(republishBusesQuerySchema.parse({})).toEqual({});
    expect(
      republishBusesQuerySchema.safeParse({ branchId: '9b2c7a10-1111-4c4c-8888-123456789abc' })
        .success,
    ).toBe(true);
    expect(republishBusesQuerySchema.safeParse({ branchId: 'x' }).success).toBe(false);
  });
});
