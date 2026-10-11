import { z } from 'zod';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
export const PAGE_SIZE_OPTIONS = [20, 50, 100] as const;

export const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});
export type PageQuery = z.infer<typeof pageQuerySchema>;

export const pageSchema = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
  });

export const pageWithSummarySchema = <T extends z.ZodType, S extends z.ZodType>(
  item: T,
  summary: S,
) => pageSchema(item).extend({ summary });

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
export type PageWithSummary<T, S> = Page<T> & { summary: S };

export const pageArgs = ({ page, pageSize }: PageQuery) => ({
  skip: (page - 1) * pageSize,
  take: pageSize,
});

export const toPage = <T>(items: T[], total: number, { page, pageSize }: PageQuery): Page<T> => ({
  items,
  total,
  page,
  pageSize,
});

export const pageCount = (total: number, pageSize: number): number =>
  Math.max(1, Math.ceil(total / pageSize));
