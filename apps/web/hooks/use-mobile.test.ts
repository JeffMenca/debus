import { act, renderHook } from '@testing-library/react';
import { useIsMobile } from './use-mobile';

function fakeMatchMedia(initial: boolean) {
  const listeners = new Set<() => void>();
  let matches = initial;
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    get matches() {
      return matches;
    },
    media: query,
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  }));
  return {
    set(value: boolean) {
      matches = value;
      listeners.forEach((listener) => listener());
    },
    listeners,
  };
}

describe('useIsMobile', () => {
  it('reports a phone-sized screen and follows changes', () => {
    const media = fakeMatchMedia(true);
    const { result } = renderHook(() => useIsMobile());

    expect(result.current).toBe(true);
    act(() => media.set(false));
    expect(result.current).toBe(false);
  });

  it('stops listening when unmounted', () => {
    const media = fakeMatchMedia(false);
    const { unmount } = renderHook(() => useIsMobile());

    expect(media.listeners.size).toBe(1);
    unmount();
    expect(media.listeners.size).toBe(0);
  });
});
