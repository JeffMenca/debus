import { render, screen } from '@testing-library/react';
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
});
