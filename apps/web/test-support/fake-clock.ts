import { act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// What the search boxes wait after the last key (useDebouncedValue).
export const DEBOUNCE_MS = 300;

// Runs the test on a fake clock: typing costs no time and only `elapse` moves it, so a debounce is
// measured from the last key however slow the machine is. Start it before rendering and call
// `jest.useRealTimers()` in an `afterEach`.
export function startFakeClock() {
  jest.useFakeTimers();
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  return {
    type: (element: HTMLElement, text: string) => user.type(element, text),
    elapse: (ms: number) =>
      act(() => {
        jest.advanceTimersByTime(ms);
      }),
  };
}
