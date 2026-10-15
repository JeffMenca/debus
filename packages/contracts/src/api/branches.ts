import { z } from 'zod';
import { USER_STATUSES, emailSchema, fullNameSchema, phoneSchema } from './auth';
import { pageQuerySchema, pageSchema, pageWithSummarySchema } from './pagination';
import { searchTermSchema } from '../text';

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

// What every session may read: the branch itself, never the people who run it.
export const branchSchema = branchFieldsSchema.extend({
  id: z.uuid(),
  active: z.boolean(),
  version: z.number().int().positive(),
});
export type Branch = z.infer<typeof branchSchema>;

// Only a system admin receives the administrators of a branch.
export const branchWithAdminsSchema = branchSchema.extend({
  admins: z.array(branchAdminSchema),
});
export type BranchWithAdmins = z.infer<typeof branchWithAdminsSchema>;

export const BRANCH_LIST_STATUSES = ['active', 'inactive', 'all'] as const;
export type BranchListStatus = (typeof BRANCH_LIST_STATUSES)[number];

export const branchListQuerySchema = z
  .object({
    status: z.enum(BRANCH_LIST_STATUSES).default('active'),
    q: searchTermSchema.optional(),
  })
  .extend(pageQuerySchema.shape);
export type BranchListQuery = z.infer<typeof branchListQuerySchema>;

export const branchStatusCountsSchema = z.object({
  active: z.number().int().nonnegative(),
  inactive: z.number().int().nonnegative(),
});
export type BranchStatusCounts = z.infer<typeof branchStatusCountsSchema>;

const branchSummarySchema = z.object({ statusCounts: branchStatusCountsSchema });
export const branchPageSchema = pageWithSummarySchema(branchSchema, branchSummarySchema);
export type BranchPage = z.infer<typeof branchPageSchema>;
export const branchWithAdminsPageSchema = pageWithSummarySchema(
  branchWithAdminsSchema,
  branchSummarySchema,
);
export type BranchWithAdminsPage = z.infer<typeof branchWithAdminsPageSchema>;

// What a visitor without a session may read: where each active branch is, for the map of the home
// page. No code, phone, address or people.
export const publicBranchLocationSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  municipality: z.string(),
  department: z.enum(GUATEMALA_DEPARTMENTS),
  latitude: z.number(),
  longitude: z.number(),
});
export type PublicBranchLocation = z.infer<typeof publicBranchLocationSchema>;
export const publicBranchLocationPageSchema = pageSchema(publicBranchLocationSchema);
export type PublicBranchLocationPage = z.infer<typeof publicBranchLocationPageSchema>;
