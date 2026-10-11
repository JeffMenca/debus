import { useMediaQuery } from './use-media-query';

const MOBILE_BREAKPOINT = 768;
const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

// The server renders the desktop layout and the client corrects it on hydration.
export function useIsMobile(): boolean {
  return useMediaQuery(QUERY);
}
