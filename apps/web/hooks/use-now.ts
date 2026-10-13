import { useEffect, useState } from 'react';

// The current time in milliseconds, refreshed every `intervalMs` so screens that show progress keep up.
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
