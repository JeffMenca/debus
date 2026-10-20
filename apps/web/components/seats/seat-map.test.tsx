import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SeatMap } from './seat-map';

function renderMap(selected: number[] = [], taken: number[] = [1, 2]) {
  const onToggle = jest.fn();
  render(<SeatMap capacity={12} taken={taken} selected={selected} onToggle={onToggle} />);
  return onToggle;
}

describe('SeatMap', () => {
  it('shows every seat of the bus with its state', () => {
    renderMap([9]);

    expect(screen.getAllByRole('button', { name: /^Asiento/ })).toHaveLength(12);
    expect(screen.getByRole('button', { name: 'Asiento 1, ocupado' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Asiento 9', pressed: true })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Asiento 10', pressed: false })).toBeEnabled();
  });

  it('chooses and lets go of a free seat with the mouse or the keyboard', async () => {
    const onToggle = renderMap();

    await userEvent.click(screen.getByRole('button', { name: 'Asiento 5' }));
    screen.getByRole('button', { name: 'Asiento 6' }).focus();
    await userEvent.keyboard('{Enter}');

    expect(onToggle.mock.calls).toEqual([[5], [6]]);
  });

  it('never lets a taken seat be chosen', async () => {
    const onToggle = renderMap();

    await userEvent.click(screen.getByRole('button', { name: 'Asiento 2, ocupado' }));

    expect(onToggle).not.toHaveBeenCalled();
  });

  it('stops offering free seats once the sale carries the most it may', () => {
    renderMap([3, 4, 5, 6, 7, 8, 9, 10, 11, 12], []);

    expect(screen.getByRole('button', { name: 'Asiento 1' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Asiento 3', pressed: true })).toBeEnabled();
    expect(
      screen.getByText('Ya elegiste 10 asientos, lo más que lleva una venta.'),
    ).toBeInTheDocument();
  });
});
