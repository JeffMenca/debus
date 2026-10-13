import { act, renderHook } from '@testing-library/react';
import { useNow } from './use-now';

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-10-20T12:00:00.000Z'));
});
afterEach(() => jest.useRealTimers());

it('starts on the current time', () => {
  const { result } = renderHook(() => useNow(60_000));

  expect(result.current).toBe(Date.parse('2026-10-20T12:00:00.000Z'));
});

it('moves forward on its own every interval', () => {
  const { result } = renderHook(() => useNow(60_000));

  act(() => jest.advanceTimersByTime(60_000));

  expect(result.current).toBe(Date.parse('2026-10-20T12:01:00.000Z'));
});

it('stops when the component goes away', () => {
  const { unmount } = renderHook(() => useNow(60_000));

  unmount();

  expect(jest.getTimerCount()).toBe(0);
});
