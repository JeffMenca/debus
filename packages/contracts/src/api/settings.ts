import { z } from 'zod';
import { isoDateSchema } from '../dates';

const hasAtMostTwoDecimals = (value: number): boolean =>
  Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;

export const moneySchema = z
  .number()
  .positive()
  .max(100_000)
  .refine(hasAtMostTwoDecimals, { message: 'at most two decimals' });

export const createSettingsRequestSchema = z.object({
  depreciationPerKm: moneySchema,
  rentalRatePerKm: moneySchema,
  effectiveFrom: isoDateSchema,
});
export type CreateSettingsRequest = z.infer<typeof createSettingsRequestSchema>;

export const settingsVersionSchema = createSettingsRequestSchema.extend({
  id: z.uuid(),
  createdAt: z.iso.datetime(),
  createdByName: z.string().nullable(),
});
export type SettingsVersion = z.infer<typeof settingsVersionSchema>;

export const settingsOverviewSchema = z.object({
  current: settingsVersionSchema.nullable(),
  versions: z.array(settingsVersionSchema),
});
export type SettingsOverview = z.infer<typeof settingsOverviewSchema>;

export interface DatedVersion {
  effectiveFrom: string;
  createdAt: string;
}

// The version in force on a date is the latest one starting on or before it; on the same
// start date the one recorded last wins. ISO strings compare correctly as text.
export function effectiveVersion<T extends DatedVersion>(
  versions: readonly T[],
  date: string,
): T | null {
  let best: T | null = null;
  for (const version of versions) {
    if (version.effectiveFrom > date) continue;
    const newer =
      !best ||
      version.effectiveFrom > best.effectiveFrom ||
      (version.effectiveFrom === best.effectiveFrom && version.createdAt > best.createdAt);
    if (newer) best = version;
  }
  return best;
}
