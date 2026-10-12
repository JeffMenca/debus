import { driverChangedPayloadSchema, exampleDriver } from '@debus/contracts';
import { Prisma } from '../generated/prisma/client';
import { fromIsoDay, toDriver, toDriverPayload, toIsoDay } from './driver-mappers';

const row = {
  id: exampleDriver.driverId,
  branchId: exampleDriver.branchId,
  fullName: exampleDriver.fullName,
  email: exampleDriver.email,
  phone: exampleDriver.phone,
  licenseNumber: exampleDriver.licenseNumber,
  licenseType: exampleDriver.licenseType,
  licenseExpiresOn: new Date('2027-03-01T00:00:00.000Z'),
  baseSalary: new Prisma.Decimal('350.00'),
  active: true,
  completedTrips: 7,
  photoKey: null,
  searchText: 'ignored',
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('driver mappers', () => {
  it('converts a date column to its ISO day and back', () => {
    expect(toIsoDay(new Date('2027-03-01T00:00:00.000Z'))).toBe('2027-03-01');
    expect(fromIsoDay('2027-03-01')).toEqual(new Date('2027-03-01T00:00:00.000Z'));
  });

  it('shows a driver with the plate of the bus he drives', () => {
    expect(toDriver({ ...row, assignedBus: { plate: 'C482BTX' } })).toEqual({
      id: row.id,
      branchId: row.branchId,
      fullName: 'Julio Pérez',
      email: 'julio.perez@example.com',
      phone: '55551234',
      licenseNumber: 'A1234567',
      licenseType: 'A',
      licenseExpiresOn: '2027-03-01',
      baseSalary: 350,
      active: true,
      assignedBusPlate: 'C482BTX',
      completedTrips: 7,
      hasPhoto: false,
      version: 1,
    });
  });

  it('tells a driver without bus and with photo apart', () => {
    expect(toDriver({ ...row, photoKey: 'drivers/x/y', assignedBus: null })).toMatchObject({
      assignedBusPlate: null,
      hasPhoto: true,
    });
  });

  it('builds a snapshot that fits the contract of the event', () => {
    expect(driverChangedPayloadSchema.parse(toDriverPayload(row))).toEqual(exampleDriver);
  });
});
