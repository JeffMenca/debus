import { z } from 'zod';
import { USER_ROLES } from '../api/auth';

export const ACCOUNT_LINK_REASONS = [
  'INVITATION',
  'SIGNUP',
  'PASSWORD_RESET',
  'ALREADY_REGISTERED',
] as const;
export type AccountLinkReason = (typeof ACCOUNT_LINK_REASONS)[number];

export const accountLinkIssuedPayloadSchema = z
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
export type AccountLinkIssuedPayload = z.infer<typeof accountLinkIssuedPayloadSchema>;

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
});
export type UserRegisteredPayload = z.infer<typeof userRegisteredPayloadSchema>;
