import { act, renderHook } from '@testing-library/react';
import { useCountUp } from './use-count-up';

const setReducedMotion = (reduce: boolean) => {
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches: reduce && query === '(prefers-reduced-motion: reduce)',
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
};

describe('useCountUp', () => {
  let now = 0;
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 1;

  const advance = (ms: number) => {
    now += ms;
    const pending = [...frames.entries()];
    frames.clear();
    act(() => pending.forEach(([, callback]) => callback(now)));
  };

  beforeEach(() => {
    now = 0;
    frames.clear();
    nextFrame = 1;
    setReducedMotion(false);
    jest.spyOn(performance, 'now').mockImplementation(() => now);
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.set(nextFrame, callback);
      return nextFrame++;
    });
    jest.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      frames.delete(id);
    });
  });
  afterEach(() => jest.restoreAllMocks());

  it('starts at zero and lands exactly on the value when the time is up', () => {
    const { result } = renderHook(() => useCountUp(100, 1000));

    expect(result.current).toBe(0);
    advance(500);
    expect(result.current).toBeGreaterThan(0);
    expect(result.current).toBeLessThan(100);
    advance(600);
    expect(result.current).toBe(100);
  });

  it('shows the value at once when the person prefers reduced motion', () => {
    setReducedMotion(true);
    const { result } = renderHook(() => useCountUp(250));

    expect(result.current).toBe(250);
    expect(frames.size).toBe(0);
  });

  it('animates from what is shown to the new value', () => {
    const { result, rerender } = renderHook(({ value }) => useCountUp(value, 1000), {
      initialProps: { value: 100 },
    });
    advance(1000);
    expect(result.current).toBe(100);

    rerender({ value: 200 });
    advance(500);

    expect(result.current).toBeGreaterThan(100);
    expect(result.current).toBeLessThan(200);
    advance(600);
    expect(result.current).toBe(200);
  });

  it('stops animating when unmounted', () => {
    const { unmount } = renderHook(() => useCountUp(100));

    unmount();

    expect(frames.size).toBe(0);
  });
});
