import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { z } from 'zod';
import { apiRequest } from '@/lib/api/client';

// The server filters, pages and adds up the whole filter; the previous page stays on screen
// while the next one arrives.
export function useReport<T>(path: string, search: URLSearchParams, schema: z.ZodType<T>) {
  const query = search.toString();
  return useQuery({
    queryKey: ['report', path, query],
    queryFn: () => apiRequest(`${path}?${query}`, schema),
    placeholderData: keepPreviousData,
  });
}
