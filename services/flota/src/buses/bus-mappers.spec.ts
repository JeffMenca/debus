import { busChangedPayloadSchema, exampleBus } from '@debus/contracts';
import { toBus, toBusPayload } from './bus-mappers';

const row = {
  id: exampleBus.busId,
  branchId: exampleBus.branchId,
  plate: exampleBus.plate,
  brand: exampleBus.brand,
  model: exampleBus.model,
  year: exampleBus.year,
  capacity: exampleBus.capacity,
  mileageKm: exampleBus.mileageKm,
  operationalStatus: 'AVAILABLE' as const,
  active: true,
  inTransit: false,
  completedTrips: 4,
  assignedDriverId: exampleBus.assignedDriverId,
  photoKey: 'buses/x/y',
  searchText: 'ignored',
  version: 3,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('bus mappers', () => {
  it('shows a bus with the name of its driver and the status a person sees', () => {
    expect(toBus({ ...row, assignedDriver: { fullName: 'Julio Pérez' } })).toEqual({
      id: row.id,
      branchId: row.branchId,
      plate: 'C482BTX',
      brand: 'Volvo',
      model: 'B8R',
      year: 2021,
      capacity: 40,
      mileageKm: 148410,
      operationalStatus: 'AVAILABLE',
      assignedDriverId: row.assignedDriverId,
      assignedDriverName: 'Julio Pérez',
      active: true,
      displayStatus: 'AVAILABLE',
      completedTrips: 4,
      hasPhoto: true,
      version: 3,
    });
  });

  it('tells a bus without driver, photo or service apart', () => {
    const bus = toBus({
      ...row,
      assignedDriverId: null,
      assignedDriver: null,
      photoKey: null,
      inTransit: true,
    });

    expect(bus).toMatchObject({
      assignedDriverName: null,
      hasPhoto: false,
      displayStatus: 'IN_TRANSIT',
    });
  });

  it('builds a snapshot that fits the contract of the event', () => {
    const payload = toBusPayload({ ...row, version: 1 });

    expect(busChangedPayloadSchema.parse(payload)).toEqual(exampleBus);
  });
});
