import { z } from 'zod';
import { USER_ROLES, USER_STATUSES, fullNameSchema, managedUserSchema } from './auth';
import { pageQuerySchema, pageWithSummarySchema } from './pagination';
import { searchTermSchema } from '../text';

export const USER_GROUPS = ['staff', 'clients'] as const;
export type UserGroup = (typeof USER_GROUPS)[number];

export const userListQuerySchema = z
  .object({
    role: z.enum(USER_ROLES).optional(),
    status: z.enum(USER_STATUSES).optional(),
    branchId: z.uuid().optional(),
    group: z.enum(USER_GROUPS).optional(),
    q: searchTermSchema.optional(),
  })
  .extend(pageQuerySchema.shape);
export type UserListQuery = z.infer<typeof userListQuerySchema>;

export const userListItemSchema = managedUserSchema.extend({ branchName: z.string().nullable() });
export type UserListItem = z.infer<typeof userListItemSchema>;

export const userStatusCountsSchema = z.object({
  PENDING: z.number().int().nonnegative(),
  ACTIVE: z.number().int().nonnegative(),
  INACTIVE: z.number().int().nonnegative(),
});
export type UserStatusCounts = z.infer<typeof userStatusCountsSchema>;

export const userPageSchema = pageWithSummarySchema(
  userListItemSchema,
  z.object({ statusCounts: userStatusCountsSchema }),
);
export type UserPage = z.infer<typeof userPageSchema>;

export const updateUserRequestSchema = z
  .object({ fullName: fullNameSchema.optional(), branchId: z.uuid().optional() })
  .refine((value) => value.fullName !== undefined || value.branchId !== undefined, {
    message: 'at least one field is required',
  });
export type UpdateUserRequest = z.infer<typeof updateUserRequestSchema>;
