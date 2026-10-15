import { z } from 'zod';
import { signupRequestSchema } from './auth';

// Staff accounts get a profile too, with these fields still empty until they fill them in.
export const clientProfileSchema = z.object({
  userId: z.uuid(),
  email: z.email(),
  fullName: z.string(),
  dpi: z.string().nullable(),
  phone: z.string().nullable(),
  nit: z.string().nullable(),
  address: z.string().nullable(),
  updatedAt: z.iso.datetime(),
});
export type ClientProfile = z.infer<typeof clientProfileSchema>;

// The same rules as the signup; a blank NIT or address clears it.
export const updateProfileRequestSchema = signupRequestSchema.pick({
  dpi: true,
  phone: true,
  nit: true,
  address: true,
});
export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>;
