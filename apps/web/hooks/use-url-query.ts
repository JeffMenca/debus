'use client';

import type { PageQuery } from '@debus/contracts';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';

// The address is the list state: reloading, sharing a link or going back keeps the same page.
// `read` and `write` belong at module level, so their identity stays stable between renders.
export function useUrlQuery<Q extends PageQuery>(
  read: (search: URLSearchParams) => Q,
  write: (query: Q) => URLSearchParams,
) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const query = useMemo(
    () => read(new URLSearchParams(searchParams.toString())),
    [read, searchParams],
  );
  const update = useCallback(
    (patch: Partial<Q>) => {
      const onlyPage = Object.keys(patch).every((key) => key === 'page');
      const next = { ...query, ...patch, ...(onlyPage ? {} : { page: 1 }) };
      const search = write(next).toString();
      router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
    },
    [query, router, pathname, write],
  );
  return [query, update] as const;
}
