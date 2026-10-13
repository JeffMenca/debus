import { bus } from '../../test-support/fleet';
import { busToFields } from './bus-fields';

it('keeps only what the service takes when a bus is saved', () => {
  expect(busToFields(bus({ assignedDriverId: 'd1', assignedDriverName: 'Julio' }))).toEqual({
    plate: 'C482BTX',
    brand: 'Volvo',
    model: 'B8R',
    year: 2021,
    capacity: 40,
    mileageKm: 148410,
    operationalStatus: 'AVAILABLE',
    assignedDriverId: 'd1',
  });
});
