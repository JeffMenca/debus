export const identityHeaders = (userId: string, role = 'CLIENT', branchId?: string) => ({
  'x-user-id': userId,
  'x-user-role': role,
  ...(branchId && { 'x-branch-id': branchId }),
});
