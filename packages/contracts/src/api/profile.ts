import { z } from 'zod';
import { searchTermSchema } from '../text';
import { signupRequestSchema } from './auth';
import { pageQuerySchema, pageSchema } from './pagination';

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

// What a branch admin sees to recognize a client when recording a rental for them.
export const clientOptionSchema = clientProfileSchema.pick({
  userId: true,
  fullName: true,
  email: true,
  nit: true,
});
export type ClientOption = z.infer<typeof clientOptionSchema>;

export const clientOptionQuerySchema = pageQuerySchema.extend({
  q: searchTermSchema.optional(),
});
export type ClientOptionQuery = z.infer<typeof clientOptionQuerySchema>;
export const clientOptionPageSchema = pageSchema(clientOptionSchema);
export type ClientOptionPage = z.infer<typeof clientOptionPageSchema>;
