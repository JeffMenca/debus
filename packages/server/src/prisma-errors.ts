// Structural checks: each service has its own generated Prisma client, so no class is shared.
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002'
  );
}

export function isConstraintViolation(error: unknown, constraint: string): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { message, meta } = error as { message?: unknown; meta?: unknown };
  return [message, JSON.stringify(meta ?? null)].some(
    (text) => typeof text === 'string' && text.includes(constraint),
  );
}
