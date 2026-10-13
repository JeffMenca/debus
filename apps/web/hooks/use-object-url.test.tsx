import { StrictMode } from 'react';
import { renderHook } from '@testing-library/react';
import { useObjectUrl } from './use-object-url';

const create = jest.fn();
const revoke = jest.fn();

beforeEach(() => {
  jest.useFakeTimers();
  create.mockReset().mockImplementation(() => `blob:url-${create.mock.calls.length}`);
  revoke.mockReset();
  Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
});
afterEach(() => jest.useRealTimers());

const blobA = new Blob(['a']);
const blobB = new Blob(['b']);

it('gives an object URL for the blob and none without one', () => {
  expect(renderHook(() => useObjectUrl(blobA)).result.current).toBe('blob:url-1');
  expect(renderHook(() => useObjectUrl(null)).result.current).toBeNull();
  expect(renderHook(() => useObjectUrl(undefined)).result.current).toBeNull();
});

it('keeps the same URL while the blob does not change', () => {
  const { result, rerender } = renderHook(({ blob }) => useObjectUrl(blob), {
    initialProps: { blob: blobA },
  });
  const first = result.current;

  rerender({ blob: blobA });

  expect(result.current).toBe(first);
  expect(create).toHaveBeenCalledTimes(1);
});

it('releases the URL when the component goes away', () => {
  const { unmount } = renderHook(() => useObjectUrl(blobA));

  unmount();
  jest.runAllTimers();

  expect(revoke).toHaveBeenCalledWith('blob:url-1');
});

it('releases the old URL when the blob changes', () => {
  const { result, rerender } = renderHook(({ blob }) => useObjectUrl(blob), {
    initialProps: { blob: blobA },
  });

  rerender({ blob: blobB });
  jest.runAllTimers();

  expect(result.current).toBe('blob:url-2');
  expect(revoke).toHaveBeenCalledWith('blob:url-1');
  expect(revoke).not.toHaveBeenCalledWith('blob:url-2');
});

it('does not release a URL that is still shown when React mounts the component twice', () => {
  const { result } = renderHook(() => useObjectUrl(blobA), { wrapper: StrictMode });

  jest.runAllTimers();

  expect(revoke).not.toHaveBeenCalledWith(result.current);
});
