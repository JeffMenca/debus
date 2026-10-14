// Structural checks: each service has its own generated Prisma client, so no class is shared.
const hasPrismaCode = (error: unknown, code: string): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === code;

export function isUniqueViolation(error: unknown): boolean {
  return hasPrismaCode(error, 'P2002');
}

// A row still points at the one being deleted (or at one that does not exist).
export function isForeignKeyViolation(error: unknown): boolean {
  return hasPrismaCode(error, 'P2003');
}

// An update or delete found no row to act on.
export function isRecordMissing(error: unknown): boolean {
  return hasPrismaCode(error, 'P2025');
}

export function isConstraintViolation(error: unknown, constraint: string): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { message, meta } = error as { message?: unknown; meta?: unknown };
  return [message, JSON.stringify(meta ?? null)].some(
    (text) => typeof text === 'string' && text.includes(constraint),
  );
}

// The database aborts one of two transactions that wait for each other (or that wrote the same
// row) and asks the caller to run it again; Prisma reports it as P2034. P2028 means the transaction
// never started because no connection was free in time: nothing ran, so it is safe to try again.
export function isTransactionConflict(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { code, message, meta } = error as { code?: unknown; message?: unknown; meta?: unknown };
  return (
    code === 'P2034' ||
    code === 'P2028' ||
    (typeof message === 'string' && message.includes('deadlock detected')) ||
    JSON.stringify(meta ?? null).includes('40P01')
  );
}
