import { z } from 'zod';
import { USER_ROLES, USER_STATUSES, fullNameSchema } from './auth';

export const userListQuerySchema = z.object({
  role: z.enum(USER_ROLES).optional(),
  status: z.enum(USER_STATUSES).optional(),
  branchId: z.uuid().optional(),
  q: z.string().trim().max(80).optional(),
});
export type UserListQuery = z.infer<typeof userListQuerySchema>;

export const updateUserRequestSchema = z
  .object({ fullName: fullNameSchema.optional(), branchId: z.uuid().optional() })
  .refine((value) => value.fullName !== undefined || value.branchId !== undefined, {
    message: 'at least one field is required',
  });
export type UpdateUserRequest = z.infer<typeof updateUserRequestSchema>;
