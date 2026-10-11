import { act, renderHook } from '@testing-library/react';
import { useUrlSearch } from './use-url-search';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const settle = () => act(() => jest.advanceTimersByTime(300));

it('starts with the search the address carries', () => {
  const { result } = renderHook(() => useUrlSearch('jose', jest.fn()));

  expect(result.current[0]).toBe('jose');
});

it('writes the search to the address once typing stops, and keeps what was typed', () => {
  const update = jest.fn();
  const { result, rerender } = renderHook(({ q }) => useUrlSearch(q, update), {
    initialProps: { q: undefined as string | undefined },
  });

  act(() => result.current[1]('ana'));
  expect(update).not.toHaveBeenCalled();
  settle();
  expect(update).toHaveBeenCalledWith({ q: 'ana' });

  // The address catches up with what was written: the box must not move.
  rerender({ q: 'ana' });
  expect(result.current[0]).toBe('ana');
  expect(update).toHaveBeenCalledTimes(1);
});

it('clears the box when the address is cleared from outside', () => {
  const update = jest.fn();
  const { result, rerender } = renderHook(({ q }) => useUrlSearch(q, update), {
    initialProps: { q: 'jose' as string | undefined },
  });

  rerender({ q: undefined });
  expect(result.current[0]).toBe('');
  settle();

  expect(update).not.toHaveBeenCalled();
});

it('follows any other change of the address', () => {
  const { result, rerender } = renderHook(({ q }) => useUrlSearch(q, jest.fn()), {
    initialProps: { q: 'jose' as string | undefined },
  });

  rerender({ q: 'ana' });

  expect(result.current[0]).toBe('ana');
});

it('does not write the old text back when the address changes under it', () => {
  const update = jest.fn();
  const { result, rerender } = renderHook(({ q, on }) => useUrlSearch(q, on), {
    initialProps: { q: 'jose' as string | undefined, on: update },
  });

  // A new `update` identity (the address changed) must not replay the stale text.
  rerender({ q: undefined, on: jest.fn() });
  settle();

  expect(update).not.toHaveBeenCalled();
  expect(result.current[0]).toBe('');
});
