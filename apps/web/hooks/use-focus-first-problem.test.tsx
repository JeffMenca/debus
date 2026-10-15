import { render, renderHook, screen, waitFor } from '@testing-library/react';
import { useFocusFirstProblem } from './use-focus-first-problem';

const ORDER = ['route', 'bus', 'driver'] as const;

beforeEach(() => {
  render(
    <form>
      <input id="route" aria-label="Ruta" />
      <input id="bus" aria-label="Bus" />
      <input id="driver" aria-label="Chofer" />
    </form>,
  );
});

describe('useFocusFirstProblem', () => {
  it('focuses the first field in screen order, whatever order the problems come in', async () => {
    const { result } = renderHook(() => useFocusFirstProblem(ORDER));

    result.current(['driver', 'bus']);

    await waitFor(() => expect(screen.getByLabelText('Bus')).toHaveFocus());
  });

  it('does nothing when no listed field has a problem', async () => {
    const { result } = renderHook(() => useFocusFirstProblem(ORDER));

    result.current(['other']);
    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(document.body).toHaveFocus();
  });

  it('does not fail when the field is no longer on the page', async () => {
    const { result } = renderHook(() => useFocusFirstProblem(['gone', 'bus']));

    expect(() => result.current(['gone'])).not.toThrow();
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });

  it('keeps the same function while the order does not change', () => {
    const { result, rerender } = renderHook(() => useFocusFirstProblem(ORDER));
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });
});
