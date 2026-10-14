import { MAX_PAGE_SIZE } from '@debus/contracts';
import { useState } from 'react';
import { useDebouncedValue } from '@/hooks/use-debounced-value';

// The server pages its lists; a select asks for the largest page and, when needed, a search.
export const OPTIONS_PAGE = { page: 1, pageSize: MAX_PAGE_SIZE } as const;

// What the person types in the search box of a select, and the term that goes to the server.
export function useOptionSearch() {
  const [search, setSearch] = useState('');
  const term = useDebouncedValue(search.trim());
  return [search, setSearch, term || undefined] as const;
}
