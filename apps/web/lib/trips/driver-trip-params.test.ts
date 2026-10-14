import { readDriverTripParams, writeDriverTripParams } from './driver-trip-params';

const read = (search: string) => readDriverTripParams(new URLSearchParams(search));

it('opens on the upcoming trips', () => {
  expect(read('')).toEqual({ status: 'SCHEDULED', page: 1, pageSize: 20 });
});

it.each([
  ['proximos', 'SCHEDULED'],
  ['en-ruta', 'IN_TRANSIT'],
  ['completados', 'COMPLETED'],
])('maps estado=%s to %s and back', (slug, status) => {
  const view = read(`estado=${slug}&pagina=2`);

  expect(view).toEqual({ status, page: 2, pageSize: 20 });
  expect(writeDriverTripParams(view).toString()).toBe(
    slug === 'proximos' ? 'pagina=2' : `estado=${slug}&pagina=2`,
  );
});

it('keeps the defaults out of the address', () => {
  expect(writeDriverTripParams({ status: 'SCHEDULED', page: 1, pageSize: 20 }).toString()).toBe('');
});

it('falls back to the upcoming trips when the address carries a strange state', () => {
  expect(read('estado=todos').status).toBe('SCHEDULED');
});
