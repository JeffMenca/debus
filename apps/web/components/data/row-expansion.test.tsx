import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExpandToggle, ExpansionContext, useRowExpansion } from './row-expansion';

const user = userEvent.setup({ applyAccept: false });

describe('useRowExpansion', () => {
  it('opens and closes each row on its own', () => {
    const { result } = renderHook(() => useRowExpansion());
    expect([...result.current.expanded]).toEqual([]);

    act(() => result.current.toggle('a'));
    act(() => result.current.toggle('b'));
    expect([...result.current.expanded]).toEqual(['a', 'b']);

    act(() => result.current.toggle('a'));
    expect([...result.current.expanded]).toEqual(['b']);
  });

  it('keeps the same value while nothing opens or closes, so the columns are not rebuilt', () => {
    const { result, rerender } = renderHook(() => useRowExpansion());
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });
});

describe('ExpandToggle', () => {
  it('says whether its row is open, toggles it and turns the chevron without motion if asked', async () => {
    const toggle = jest.fn();
    const { rerender } = render(
      <ExpansionContext value={{ expanded: new Set(), toggle }}>
        <ExpandToggle id="a">Cobán</ExpandToggle>
      </ExpansionContext>,
    );
    const button = screen.getByRole('button', { name: 'Cobán' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button.querySelector('svg')).not.toHaveClass('rotate-90');

    await user.click(button);
    expect(toggle).toHaveBeenCalledWith('a');

    rerender(
      <ExpansionContext value={{ expanded: new Set(['a']), toggle }}>
        <ExpandToggle id="a">Cobán</ExpandToggle>
      </ExpansionContext>,
    );
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(button.querySelector('svg')).toHaveClass('rotate-90', 'motion-reduce:transition-none');
  });
});
