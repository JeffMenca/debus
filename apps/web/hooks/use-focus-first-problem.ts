'use client';

import { useCallback } from 'react';

// After a failed submit the person lands on the first field that needs a change, in screen order.
export function useFocusFirstProblem(order: readonly string[]) {
  return useCallback(
    (problemIds: string[]) => {
      const first = order.find((id) => problemIds.includes(id));
      if (first) requestAnimationFrame(() => document.getElementById(first)?.focus());
    },
    [order],
  );
}
