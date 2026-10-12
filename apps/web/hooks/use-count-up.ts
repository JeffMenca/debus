'use client';

import { useEffect, useRef, useState } from 'react';
import { useMediaQuery } from './use-media-query';

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

// Counts up to the value with a cubic ease-out; with reduced motion it just shows the value.
export function useCountUp(value: number, durationMs = 1200): number {
  const reduced = useMediaQuery(REDUCED_MOTION);
  const [shown, setShown] = useState(0);
  const shownRef = useRef(0);

  useEffect(() => {
    if (reduced) return;
    const from = shownRef.current;
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      const eased = 1 - (1 - progress) ** 3;
      shownRef.current = progress === 1 ? value : from + (value - from) * eased;
      setShown(shownRef.current);
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, durationMs, reduced]);

  return reduced ? value : shown;
}
