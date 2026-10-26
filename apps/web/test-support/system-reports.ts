import type { Branch } from '@debus/contracts';

export const BRANCH_IDS = {
  xela: '8f9e6679-7425-40de-944b-e07fc1f90ae7',
  coban: '9a0e6679-7425-40de-944b-e07fc1f90ae7',
} as const;

export const branch = (over: Partial<Branch> = {}): Branch =>
  ({
    id: BRANCH_IDS.xela,
    name: 'Quetzaltenango',
    active: true,
    version: 1,
    ...over,
  }) as Branch;

export const branchOptions = () => ({
  data: [branch(), branch({ id: BRANCH_IDS.coban, name: 'Cobán' })],
});

// The money the browser writes separates the symbol with a no-break space.
export const plain = (text: string): string => text.replace(/\s/g, ' ');

// The address the screen asked the router for last.
export function lastAddress(replace: jest.Mock) {
  const [url] = replace.mock.calls.at(-1) as [string];
  const [path, query = ''] = url.split('?');
  return { path, params: new URLSearchParams(query) };
}

// The shape of a loaded, loading or failed report that the screens read.
export function reportState<T>({
  data,
  error = false,
  pending = false,
  placeholder = false,
  refetch = jest.fn(),
}: {
  data?: T;
  error?: boolean;
  pending?: boolean;
  placeholder?: boolean;
  refetch?: jest.Mock;
}) {
  return {
    data: error || pending ? undefined : data,
    isPending: pending,
    isError: error,
    isPlaceholderData: placeholder,
    refetch,
  } as never;
}

// The screens that animate read this to know whether the person asked for less motion.
export function stubReducedMotion(reduced = true) {
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches: reduced && query === '(prefers-reduced-motion: reduce)',
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}
