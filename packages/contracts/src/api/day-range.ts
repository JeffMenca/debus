import type { z } from 'zod';
import { isoDateSchema } from '../dates';

// Optional from/to filter of a list: spread into the query, then wrap it with dayRangeInOrder.
export const dayRangeShape = { from: isoDateSchema.optional(), to: isoDateSchema.optional() };

type DayRange = { from?: string | undefined; to?: string | undefined };
export const dayRangeInOrder = <T extends z.ZodType<DayRange>>(schema: T) =>
  schema.refine((value) => !value.from || !value.to || value.from <= value.to, {
    path: ['to'],
    message: 'to must not be before from',
  });
