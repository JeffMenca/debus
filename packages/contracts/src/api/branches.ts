import { z } from 'zod';
import { USER_STATUSES, emailSchema, fullNameSchema, phoneSchema } from './auth';

export const GUATEMALA_DEPARTMENTS = [
  'Alta Verapaz',
  'Baja Verapaz',
  'Chimaltenango',
  'Chiquimula',
  'El Progreso',
  'Escuintla',
  'Guatemala',
  'Huehuetenango',
  'Izabal',
  'Jalapa',
  'Jutiapa',
  'Petén',
  'Quetzaltenango',
  'Quiché',
  'Retalhuleu',
  'Sacatepéquez',
  'San Marcos',
  'Santa Rosa',
  'Sololá',
  'Suchitepéquez',
  'Totonicapán',
  'Zacapa',
] as const;
export type GuatemalaDepartment = (typeof GUATEMALA_DEPARTMENTS)[number];

export const GUATEMALA_BOUNDS = {
  minLatitude: 13.7,
  maxLatitude: 17.9,
  minLongitude: -92.3,
  maxLongitude: -88.2,
} as const;

export const isInsideGuatemala = (latitude: number, longitude: number): boolean =>
  latitude >= GUATEMALA_BOUNDS.minLatitude &&
  latitude <= GUATEMALA_BOUNDS.maxLatitude &&
  longitude >= GUATEMALA_BOUNDS.minLongitude &&
  longitude <= GUATEMALA_BOUNDS.maxLongitude;

const text = (min: number, max: number) => z.string().trim().min(min).max(max);

export const branchCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .pipe(z.string().regex(/^[A-Z]{3,5}$/));
export const latitudeSchema = z
  .number()
  .min(GUATEMALA_BOUNDS.minLatitude)
  .max(GUATEMALA_BOUNDS.maxLatitude);
export const longitudeSchema = z
  .number()
  .min(GUATEMALA_BOUNDS.minLongitude)
  .max(GUATEMALA_BOUNDS.maxLongitude);

export const branchFieldsSchema = z.object({
  code: branchCodeSchema,
  name: text(2, 80),
  department: z.enum(GUATEMALA_DEPARTMENTS),
  municipality: text(2, 80),
  address: text(5, 200),
  phone: phoneSchema,
  latitude: latitudeSchema,
  longitude: longitudeSchema,
});
export type BranchFields = z.infer<typeof branchFieldsSchema>;

export const createBranchRequestSchema = branchFieldsSchema.extend({
  admin: z.object({ fullName: fullNameSchema, email: emailSchema }),
});
export type CreateBranchRequest = z.infer<typeof createBranchRequestSchema>;

export const updateBranchRequestSchema = branchFieldsSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'at least one field is required' });
export type UpdateBranchRequest = z.infer<typeof updateBranchRequestSchema>;

export const branchAdminSchema = z.object({
  id: z.uuid(),
  fullName: z.string(),
  email: z.email(),
  status: z.enum(USER_STATUSES),
});
export type BranchAdmin = z.infer<typeof branchAdminSchema>;

export const branchSchema = branchFieldsSchema.extend({
  id: z.uuid(),
  active: z.boolean(),
  version: z.number().int().positive(),
  admins: z.array(branchAdminSchema),
});
export type Branch = z.infer<typeof branchSchema>;
