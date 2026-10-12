import { isConstraintViolation, isUniqueViolation } from './prisma-errors';

describe('database errors', () => {
  it('recognises a unique violation by its Prisma code', () => {
    expect(isUniqueViolation({ code: 'P2002' })).toBe(true);
    expect(isUniqueViolation({ code: 'P2034' })).toBe(false);
    expect(isUniqueViolation(new Error('x'))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });

  it('finds a named constraint in the message or the metadata', () => {
    expect(
      isConstraintViolation({ message: 'violates "trips_bus_no_overlap"' }, 'trips_bus_no_overlap'),
    ).toBe(true);
    expect(
      isConstraintViolation(
        { meta: { driverAdapterError: { cause: { constraint: 'trips_driver_no_overlap' } } } },
        'trips_driver_no_overlap',
      ),
    ).toBe(true);
    expect(isConstraintViolation({ message: 'other' }, 'trips_bus_no_overlap')).toBe(false);
    expect(isConstraintViolation('trips_bus_no_overlap', 'trips_bus_no_overlap')).toBe(false);
  });
});
