import { toQueryString } from '@/lib/api/query-string';

// The query of a report as the API reads it; the same keys in the same order give the same cache entry.
export const reportSearch = (query: Record<string, string | number | undefined>): URLSearchParams =>
  new URLSearchParams(toQueryString(query));
