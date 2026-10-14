import {
  isConstraintViolation,
  isForeignKeyViolation,
  isRecordMissing,
  isTransactionConflict,
  isUniqueViolation,
} from './prisma-errors';

describe('database errors', () => {
  it('recognises a unique violation by its Prisma code', () => {
    expect(isUniqueViolation({ code: 'P2002' })).toBe(true);
    expect(isUniqueViolation({ code: 'P2034' })).toBe(false);
    expect(isUniqueViolation(new Error('x'))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });

  it('recognises a foreign key violation by its Prisma code', () => {
    expect(isForeignKeyViolation({ code: 'P2003' })).toBe(true);
    expect(isForeignKeyViolation({ code: 'P2002' })).toBe(false);
    expect(isForeignKeyViolation('P2003')).toBe(false);
    expect(isForeignKeyViolation(null)).toBe(false);
  });

  it('recognises a missing record by its Prisma code', () => {
    expect(isRecordMissing({ code: 'P2025' })).toBe(true);
    expect(isRecordMissing({ code: 'P2003' })).toBe(false);
    expect(isRecordMissing(new Error('x'))).toBe(false);
    expect(isRecordMissing(undefined)).toBe(false);
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

describe('transaction conflicts', () => {
  it('recognises the write conflict and the deadlock that the database asks to retry', () => {
    expect(isTransactionConflict({ code: 'P2034' })).toBe(true);
    // The transaction never started (no free connection in time), so running it again is safe.
    expect(isTransactionConflict({ code: 'P2028' })).toBe(true);
    expect(isTransactionConflict({ message: 'ERROR: deadlock detected' })).toBe(true);
    expect(
      isTransactionConflict({ meta: { driverAdapterError: { cause: { originalCode: '40P01' } } } }),
    ).toBe(true);
    expect(isTransactionConflict({ code: 'P2002' })).toBe(false);
    expect(isTransactionConflict(new Error('boom'))).toBe(false);
    expect(isTransactionConflict(undefined)).toBe(false);
  });
});
