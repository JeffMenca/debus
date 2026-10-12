import { useEffect, useMemo } from 'react';

const pendingRelease = new Map<string, ReturnType<typeof setTimeout>>();

// An object URL for a blob that stays valid while the component shows it. It is released a moment
// after the component stops using it, so React mounting an effect twice (development) does not
// revoke a URL that is still on screen.
export function useObjectUrl(blob: Blob | null | undefined): string | null {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);

  useEffect(() => {
    if (!url) return;
    clearTimeout(pendingRelease.get(url));
    pendingRelease.delete(url);
    return () => {
      pendingRelease.set(
        url,
        setTimeout(() => {
          URL.revokeObjectURL(url);
          pendingRelease.delete(url);
        }, 0),
      );
    };
  }, [url]);

  return url;
}
