import { Prisma } from '../generated/prisma/client';
import { isUniqueViolation } from './prisma-errors';

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('failed', { code, clientVersion: 'x' });

describe('prisma errors', () => {
  it('recognizes a unique violation', () => {
    expect(isUniqueViolation(prismaError('P2002'))).toBe(true);
    expect(isUniqueViolation(prismaError('P2034'))).toBe(false);
    expect(isUniqueViolation(new Error('P2002'))).toBe(false);
  });
});
