import type { Page } from '@debus/contracts';
import { useEffect } from 'react';
import { lastPageIfOutOfRange } from '@/lib/list/page-params';

// After the last row of the last page goes away (or with `?pagina=99`), land on the last page there is.
export function usePageInRange(
  page: Page<unknown> | undefined,
  update: (patch: { page: number }) => void,
) {
  const last = page ? lastPageIfOutOfRange(page) : null;
  useEffect(() => {
    if (last) update({ page: last });
  }, [last, update]);
}
