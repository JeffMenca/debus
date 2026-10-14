// The headers the gateway adds once it has validated the token, for tests that call a service directly.
export const identityHeaders = (
  userId: string,
  role: string,
  branchId?: string,
): Record<string, string> => ({
  'x-user-id': userId,
  'x-user-role': role,
  ...(branchId && { 'x-branch-id': branchId }),
});
