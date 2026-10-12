import { z } from 'zod';

export const USER_ROLES = ['SYSTEM_ADMIN', 'BRANCH_ADMIN', 'CASHIER', 'DRIVER', 'CLIENT'] as const;
export type UserRole = (typeof USER_ROLES)[number];
export const USER_STATUSES = ['PENDING', 'ACTIVE', 'INACTIVE'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

// Drivers are not invited from users: flota registers them and their account follows from it.
export const INVITABLE_ROLES = [
  'SYSTEM_ADMIN',
  'BRANCH_ADMIN',
  'CASHIER',
  'CLIENT',
] as const satisfies UserRole[];

export const BRANCH_ROLES = ['BRANCH_ADMIN', 'CASHIER', 'DRIVER'] as const satisfies UserRole[];
export const isBranchRole = (role: UserRole): boolean =>
  (BRANCH_ROLES as readonly UserRole[]).includes(role);

export const ACCOUNT_LINK_PURPOSES = ['ACTIVATION', 'PASSWORD_RESET'] as const;
export type AccountLinkPurpose = (typeof ACCOUNT_LINK_PURPOSES)[number];

export const ACCESS_TOKEN_TTL_SECONDS = 900;
// Who signs access tokens and who accepts them: the gateway rejects tokens minted for anything else.
export const ACCESS_TOKEN_ISSUER = 'debus-administracion';
export const ACCESS_TOKEN_AUDIENCE = 'debus';
export const REFRESH_TOKEN_TTL_DAYS = 7;
export const IDENTITY_HEADERS = {
  userId: 'x-user-id',
  role: 'x-user-role',
  branchId: 'x-branch-id',
} as const;

export const ACCEPTED_MESSAGE =
  'Si los datos son correctos, te enviamos un correo con los siguientes pasos.';
export const acceptedResponseSchema = z.object({ message: z.string() });

const stripSeparators = (raw: string): string => raw.replace(/[\s-]/g, '');
export const normalizeNit = (raw: string): string => stripSeparators(raw).toUpperCase();
const blankToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

export const nitSchema = z
  .string()
  .transform(normalizeNit)
  .pipe(z.string().regex(/^\d{1,12}[\dK]$/));
export const dpiSchema = z
  .string()
  .transform(stripSeparators)
  .pipe(z.string().regex(/^\d{13}$/));
export const phoneSchema = z
  .string()
  .transform(stripSeparators)
  .pipe(z.string().regex(/^\d{8}$/));
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email());
export const passwordSchema = z.string().min(8).max(128);
export const fullNameSchema = z.string().trim().min(2).max(120);
const addressSchema = z.string().trim().max(200);

const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess(blankToUndefined, schema.optional());

export const signupRequestSchema = z.object({
  fullName: fullNameSchema,
  email: emailSchema,
  dpi: dpiSchema,
  phone: phoneSchema,
  nit: optional(nitSchema),
  address: optional(addressSchema),
});
export type SignupRequest = z.infer<typeof signupRequestSchema>;

export const createUserRequestSchema = z
  .object({
    fullName: fullNameSchema,
    email: emailSchema,
    role: z.enum(INVITABLE_ROLES),
    branchId: optional(z.uuid()),
    dpi: optional(dpiSchema),
    phone: optional(phoneSchema),
    nit: optional(nitSchema),
    address: optional(addressSchema),
  })
  .superRefine((value, ctx) => {
    if (isBranchRole(value.role) !== Boolean(value.branchId)) {
      ctx.addIssue({ code: 'custom', path: ['branchId'], message: 'branchId depends on the role' });
    }
    if (value.role === 'CLIENT' && (!value.dpi || !value.phone)) {
      ctx.addIssue({ code: 'custom', path: ['dpi'], message: 'clients need dpi and phone' });
    }
  });
export type CreateUserRequest = z.infer<typeof createUserRequestSchema>;

export const loginRequestSchema = z.object({ email: emailSchema, password: z.string().min(1) });
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export const refreshRequestSchema = z.object({ refreshToken: z.string().min(1) });
export const emailRequestSchema = z.object({ email: emailSchema });
export const linkTokenRequestSchema = z.object({ token: z.string().min(1) });
export const setPasswordRequestSchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});
export type SetPasswordRequest = z.infer<typeof setPasswordRequestSchema>;

export const LINK_STATES = ['valid', 'expired', 'used', 'invalid'] as const;
export const linkStatusSchema = z.object({
  state: z.enum(LINK_STATES),
  purpose: z.enum(ACCOUNT_LINK_PURPOSES).optional(),
});
export type LinkStatus = z.infer<typeof linkStatusSchema>;

export const sessionUserSchema = z.object({
  id: z.uuid(),
  fullName: z.string(),
  email: z.email(),
  role: z.enum(USER_ROLES),
  branchId: z.uuid().nullable(),
});
export type SessionUser = z.infer<typeof sessionUserSchema>;
export const managedUserSchema = sessionUserSchema.extend({
  status: z.enum(USER_STATUSES),
});
export type ManagedUser = z.infer<typeof managedUserSchema>;

export const authTokensSchema = z.object({
  accessToken: z.string(),
  accessExpiresIn: z.number().int().positive(),
  refreshToken: z.string(),
  refreshExpiresAt: z.iso.datetime(),
  user: sessionUserSchema,
});
export type AuthTokens = z.infer<typeof authTokensSchema>;
export const webSessionSchema = authTokensSchema.pick({
  accessToken: true,
  accessExpiresIn: true,
  user: true,
});
export type WebSession = z.infer<typeof webSessionSchema>;

export const accessTokenClaimsSchema = z.object({
  sub: z.uuid(),
  role: z.enum(USER_ROLES),
  branchId: z.uuid().nullable(),
});
export type AccessTokenClaims = z.infer<typeof accessTokenClaimsSchema>;
