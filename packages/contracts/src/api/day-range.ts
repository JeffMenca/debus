import { z } from 'zod';
import { isoDateSchema } from '../dates';
import { pageQuerySchema } from './pagination';

type DayRange = { from?: string | undefined; to?: string | undefined };
const inOrder = ({ from, to }: DayRange): boolean => !from || !to || from <= to;
const dayRangeShape = { from: isoDateSchema.optional(), to: isoDateSchema.optional() };

// A paged list query with an optional from/to day range that never goes backwards. Spreading the
// shapes (not chaining .extend) keeps from/to in the inferred type of every query built here.
export const pagedDayRangeQuery = <S extends z.ZodRawShape>(shape: S) =>
  z
    .object({ ...dayRangeShape, ...shape, ...pageQuerySchema.shape })
    // Inside the generic TypeScript cannot see from/to yet; callers get them in the inferred type.
    .refine((value) => inOrder(value as DayRange), {
      path: ['to'],
      message: 'to must not be before from',
    });
