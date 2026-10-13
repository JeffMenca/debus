export const identityHeaders = (userId: string, role: string, branchId?: string) => ({
  'x-user-id': userId,
  'x-user-role': role,
  ...(branchId && { 'x-branch-id': branchId }),
});
