import { act, renderHook } from '@testing-library/react';
import { useDebouncedValue } from './use-debounced-value';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it('changes only after the value stops changing for 300 ms', () => {
  const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value), {
    initialProps: { value: 'a' },
  });

  rerender({ value: 'ab' });
  act(() => jest.advanceTimersByTime(299));
  expect(result.current).toBe('a');
  rerender({ value: 'abc' });
  act(() => jest.advanceTimersByTime(299));
  expect(result.current).toBe('a');
  act(() => jest.advanceTimersByTime(1));

  expect(result.current).toBe('abc');
});

it('honours a custom delay', () => {
  const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 50), {
    initialProps: { value: 1 },
  });

  rerender({ value: 2 });
  act(() => jest.advanceTimersByTime(50));

  expect(result.current).toBe(2);
});
