import { z } from 'zod';
import { USER_ROLES } from '../api/auth';

export const ACCOUNT_LINK_REASONS = [
  'INVITATION',
  'SIGNUP',
  'PASSWORD_RESET',
  'ALREADY_REGISTERED',
] as const;
export type AccountLinkReason = (typeof ACCOUNT_LINK_REASONS)[number];

export const accountLinkSentPayloadSchema = z
  .object({
    userId: z.uuid(),
    email: z.email(),
    fullName: z.string().min(1),
    reason: z.enum(ACCOUNT_LINK_REASONS),
    link: z.url({ protocol: /^https?$/ }).optional(),
    expiresAt: z.iso.datetime().optional(),
  })
  .refine((value) => value.reason === 'ALREADY_REGISTERED' || (value.link && value.expiresAt), {
    message: 'link and expiresAt are required for this reason',
    path: ['link'],
  });
export type AccountLinkSentPayload = z.infer<typeof accountLinkSentPayloadSchema>;

export const userRegisteredPayloadSchema = z.object({
  userId: z.uuid(),
  email: z.email(),
  fullName: z.string().min(1),
  role: z.enum(USER_ROLES),
  branchId: z.uuid().nullable(),
  profile: z
    .object({
      dpi: z.string(),
      phone: z.string(),
      nit: z.string().nullable(),
      address: z.string().nullable(),
    })
    .nullable(),
  // The version the account reached when activated; absent in events queued before it existed.
  version: z.number().int().positive().optional(),
});
export type UserRegisteredPayload = z.infer<typeof userRegisteredPayloadSchema>;

// administracion publishes it when an account is edited, deactivated or reactivated (and republishes
// it with the version raised); notificaciones keeps the branch admins to warn them about licences.
export const userUpdatedPayloadSchema = z.object({
  userId: z.uuid(),
  email: z.email(),
  fullName: z.string().min(1),
  role: z.enum(USER_ROLES),
  branchId: z.uuid().nullable(),
  active: z.boolean(),
  version: z.number().int().positive(),
});
export type UserUpdatedPayload = z.infer<typeof userUpdatedPayloadSchema>;
