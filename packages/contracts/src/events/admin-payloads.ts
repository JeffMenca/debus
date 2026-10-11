import { z } from 'zod';
import { branchFieldsSchema } from '../api/branches';
import { moneySchema } from '../api/settings';
import { isoDateSchema } from '../dates';

// BranchCreated and BranchUpdated carry the whole snapshot; consumers keep the highest version.
export const branchChangedPayloadSchema = branchFieldsSchema.extend({
  branchId: z.uuid(),
  active: z.boolean(),
  version: z.number().int().positive(),
});
export type BranchChangedPayload = z.infer<typeof branchChangedPayloadSchema>;

export const settingsUpdatedPayloadSchema = z.object({
  versionId: z.uuid(),
  depreciationPerKm: moneySchema,
  rentalRatePerKm: moneySchema,
  effectiveFrom: isoDateSchema,
  createdAt: z.iso.datetime(),
});
export type SettingsUpdatedPayload = z.infer<typeof settingsUpdatedPayloadSchema>;
