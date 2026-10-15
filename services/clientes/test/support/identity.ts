export const identityHeaders = (userId: string, role = 'CLIENT') => ({
  'x-user-id': userId,
  'x-user-role': role,
});
