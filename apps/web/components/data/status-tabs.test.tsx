import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StatusTabs } from './status-tabs';

const options = [
  { value: 'all', label: 'Todos', count: 12 },
  { value: 'active', label: 'Activos', count: 9 },
  { value: 'inactive', label: 'Inactivos' },
] as const;

describe('StatusTabs', () => {
  it('lists the options with their counts and marks the chosen one', () => {
    render(
      <StatusTabs
        label="Estado"
        value="active"
        options={[...options]}
        onChange={() => undefined}
      />,
    );

    expect(screen.getByRole('tablist', { name: 'Estado' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Activos/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /Todos/ })).toHaveTextContent('12');
    expect(screen.getByRole('tab', { name: /Inactivos/ })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it('tells which option was chosen', async () => {
    const onChange = jest.fn();
    render(<StatusTabs label="Estado" value="all" options={[...options]} onChange={onChange} />);

    await userEvent.click(screen.getByRole('tab', { name: /Inactivos/ }));

    expect(onChange).toHaveBeenCalledWith('inactive');
  });

  it('moves with the arrow keys', async () => {
    const onChange = jest.fn();
    render(<StatusTabs label="Estado" value="all" options={[...options]} onChange={onChange} />);

    screen.getByRole('tab', { name: /Todos/ }).focus();
    await userEvent.keyboard('{ArrowRight}');

    expect(screen.getByRole('tab', { name: /Activos/ })).toHaveFocus();
  });

  it('slides the indicator to the chosen option', () => {
    const { container, rerender } = render(
      <StatusTabs label="Estado" value="all" options={[...options]} onChange={() => undefined} />,
    );
    const indicator = () => container.querySelector<HTMLElement>('span[aria-hidden]')!;
    expect(indicator().style.transform).toBe('translateX(0%)');

    rerender(
      <StatusTabs
        label="Estado"
        value="inactive"
        options={[...options]}
        onChange={() => undefined}
      />,
    );

    expect(indicator().style.transform).toBe('translateX(200%)');
    expect(indicator()).toHaveClass('motion-reduce:transition-none');
  });
  describe('measured indicator', () => {
    const widths = [77, 86, 112, 72, 98];
    const lefts = [4, 81, 167, 279, 351];
    const fiveOptions = ['a', 'b', 'c', 'd', 'e'].map((value) => ({ value, label: value }));

    function mockLayout() {
      const indexOf = (element: HTMLElement) => Number(element.dataset.tabIndex ?? -1);
      jest.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (
        this: HTMLElement,
      ) {
        return indexOf(this) >= 0 ? widths[indexOf(this)] : 0;
      });
      jest.spyOn(HTMLElement.prototype, 'offsetLeft', 'get').mockImplementation(function (
        this: HTMLElement,
      ) {
        return indexOf(this) >= 0 ? lefts[indexOf(this)] : 0;
      });
    }

    afterEach(() => jest.restoreAllMocks());

    it('sizes and places the indicator on the active tab, whatever its width', () => {
      mockLayout();
      render(<StatusTabs label="Estado" value="c" options={fiveOptions} onChange={jest.fn()} />);

      expect(screen.getByTestId('tab-indicator')).toHaveStyle({
        width: '112px',
        transform: 'translateX(167px)',
      });
    });

    it('scrolls its frame so the active tab is visible', () => {
      mockLayout();
      jest.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(300);
      render(<StatusTabs label="Estado" value="e" options={fiveOptions} onChange={jest.fn()} />);

      const frame = screen.getByRole('tablist').closest<HTMLElement>('[data-tabs-frame]')!;
      expect(frame.scrollLeft).toBe(351 + 98 - 300);
    });

    it('scrolls back when the active tab sits before the visible part', () => {
      mockLayout();
      jest.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(300);
      const { rerender } = render(
        <StatusTabs label="Estado" value="e" options={fiveOptions} onChange={jest.fn()} />,
      );
      rerender(<StatusTabs label="Estado" value="a" options={fiveOptions} onChange={jest.fn()} />);

      const frame = screen.getByRole('tablist').closest<HTMLElement>('[data-tabs-frame]')!;
      expect(frame.scrollLeft).toBe(4);
    });

    it('measures again when the bar is resized', () => {
      mockLayout();
      let notify: () => void = () => undefined;
      const disconnect = jest.fn();
      class FakeObserver {
        constructor(callback: () => void) {
          notify = callback;
        }
        observe = jest.fn();
        disconnect = disconnect;
      }
      const original = globalThis.ResizeObserver;
      globalThis.ResizeObserver = FakeObserver as unknown as typeof ResizeObserver;
      try {
        const { unmount } = render(
          <StatusTabs label="Estado" value="b" options={fiveOptions} onChange={jest.fn()} />,
        );
        widths[1] = 120;
        act(() => notify());
        expect(screen.getByTestId('tab-indicator')).toHaveStyle({ width: '120px' });
        widths[1] = 86;
        unmount();
        expect(disconnect).toHaveBeenCalled();
      } finally {
        globalThis.ResizeObserver = original;
      }
    });
  });
});
