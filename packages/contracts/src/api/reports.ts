import { z } from 'zod';
import { pageWithSummarySchema } from './pagination';

// A PDF holds every filtered row; past this many the export asks to narrow the filters instead.
export const REPORT_PDF_MAX_ROWS = 5000;
export const PDF_CONTENT_TYPE = 'application/pdf';

// Totals and groups always cover the whole filtered set, never the visible page.
export const reportPageSchema = <R extends z.ZodType, T extends z.ZodType, G extends z.ZodType>(
  row: R,
  totals: T,
  group: G,
) => pageWithSummarySchema(row, z.object({ totals, groups: z.array(group) }));

export const noGroupsSchema = z.never();
