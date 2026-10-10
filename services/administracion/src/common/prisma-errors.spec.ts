import { Prisma } from '../generated/prisma/client';
import { isSerializationFailure, isUniqueViolation } from './prisma-errors';

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('failed', { code, clientVersion: 'x' });

describe('prisma errors', () => {
  it('recognizes a unique violation', () => {
    expect(isUniqueViolation(prismaError('P2002'))).toBe(true);
    expect(isUniqueViolation(prismaError('P2034'))).toBe(false);
    expect(isUniqueViolation(new Error('P2002'))).toBe(false);
  });

  it('recognizes a serialization failure', () => {
    expect(isSerializationFailure(prismaError('P2034'))).toBe(true);
    expect(isSerializationFailure(prismaError('P2002'))).toBe(false);
    expect(isSerializationFailure(undefined)).toBe(false);
  });

  it('recognizes the conflict the driver adapter reports when a serializable transaction commits', () => {
    // Shape seen from Prisma 7 with the pg adapter: the Prisma code is not set.
    const adapterError = Object.assign(new Error('TransactionWriteConflict'), {
      name: 'DriverAdapterError',
      cause: { kind: 'TransactionWriteConflict', originalCode: '40001' },
    });

    expect(isSerializationFailure(adapterError)).toBe(true);
    expect(
      isSerializationFailure(
        Object.assign(new Error('x'), { name: 'DriverAdapterError', cause: { kind: 'Other' } }),
      ),
    ).toBe(false);
    expect(isSerializationFailure(new Error('TransactionWriteConflict'))).toBe(false);
  });
});
