import { useEffect, useRef, useState } from 'react';
import { useDebouncedValue } from './use-debounced-value';

// The box keeps what is typed; the address follows 300 ms after the last key. When the address
// changes from outside (a menu link that clears the filters, the back button) the box follows it.
export function useUrlSearch(
  q: string | undefined,
  update: (patch: { q: string | undefined }) => void,
) {
  const [search, setSearch] = useState(q ?? '');
  const typed = useDebouncedValue(search);
  // What the address holds, or is about to hold: anything else in `q` came from outside.
  const written = useRef(q ?? '');
  const latestUpdate = useRef(update);
  useEffect(() => {
    latestUpdate.current = update;
  });
  useEffect(() => {
    if (typed === written.current) return;
    written.current = typed;
    latestUpdate.current({ q: typed || undefined });
  }, [typed]);
  useEffect(() => {
    const fromAddress = q ?? '';
    if (fromAddress === written.current) return;
    written.current = fromAddress;
    setSearch(fromAddress);
  }, [q]);
  return [search, setSearch] as const;
}
