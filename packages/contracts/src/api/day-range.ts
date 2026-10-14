import { z } from 'zod';
import { isoDateSchema } from '../dates';
import { pageQuerySchema } from './pagination';

type DayRange = { from?: string | undefined; to?: string | undefined };
const inOrder = ({ from, to }: DayRange): boolean => !from || !to || from <= to;

// A paged list query with an optional from/to day range that never goes backwards.
export const pagedDayRangeQuery = <S extends z.ZodRawShape>(shape: S) =>
  z
    .object({ from: isoDateSchema.optional(), to: isoDateSchema.optional() })
    .extend(shape)
    .extend(pageQuerySchema.shape)
    // The generic shape hides from/to from the inferred type, though both are always there.
    .refine((value) => inOrder(value as DayRange), {
      path: ['to'],
      message: 'to must not be before from',
    });
