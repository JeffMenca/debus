import { Prisma } from '../generated/prisma/client';

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

export function isUniqueViolation(error: unknown): boolean {
  return hasCode(error, 'P2002');
}

// With the pg adapter a serialization failure found at commit arrives as a DriverAdapterError
// (no Prisma code); a failure found earlier arrives as P2034. Both mean "run it again".
export function isSerializationFailure(error: unknown): boolean {
  if (hasCode(error, 'P2034')) return true;
  if (!(error instanceof Error) || error.name !== 'DriverAdapterError') return false;
  return (error.cause as { kind?: string } | undefined)?.kind === 'TransactionWriteConflict';
}
