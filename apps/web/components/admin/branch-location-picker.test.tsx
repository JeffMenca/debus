import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BranchLocationPicker } from './branch-location-picker';

jest.mock(
  'next/dynamic',
  () => () =>
    function FakeMap({
      onPick,
      value,
    }: {
      onPick: (latitude: number, longitude: number) => void;
      value: { latitude: number; longitude: number } | null;
    }) {
      return (
        <div>
          <p>{value ? `pin ${value.latitude},${value.longitude}` : 'sin pin'}</p>
          <button type="button" onClick={() => onPick(14.83470001, -91.51810002)}>
            Tocar Xela
          </button>
          <button type="button" onClick={() => onPick(19.43, -99.13)}>
            Tocar México
          </button>
          <button type="button" onClick={() => onPick(13.75, -91.5)}>
            Tocar el mar
          </button>
        </div>
      );
    },
);

describe('BranchLocationPicker', () => {
  it('reports the touched point rounded to six decimals', async () => {
    const onChange = jest.fn();
    render(<BranchLocationPicker value={null} onChange={onChange} />);

    await userEvent.click(screen.getByRole('button', { name: 'Tocar Xela' }));

    expect(onChange).toHaveBeenCalledWith({
      latitude: 14.8347,
      longitude: -91.5181,
      department: 'Quetzaltenango',
    });
  });

  it('refuses a point outside Guatemala and says so', async () => {
    const onChange = jest.fn();
    render(<BranchLocationPicker value={null} onChange={onChange} />);

    await userEvent.click(screen.getByRole('button', { name: 'Tocar México' }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Ese punto está fuera de Guatemala.');
  });

  it('refuses the ocean, inside the frame of the map, and says so', async () => {
    const onChange = jest.fn();
    render(<BranchLocationPicker value={null} onChange={onChange} />);

    await userEvent.click(screen.getByRole('button', { name: 'Tocar el mar' }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Ese punto está fuera de Guatemala.');
  });

  it('forgets the warning after a good point', async () => {
    render(<BranchLocationPicker value={null} onChange={jest.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Tocar México' }));
    await userEvent.click(screen.getByRole('button', { name: 'Tocar Xela' }));

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows the pin it is given and the help text or the error', () => {
    const { rerender } = render(
      <BranchLocationPicker
        value={{ latitude: 14.8347, longitude: -91.5181 }}
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByText('pin 14.8347,-91.5181')).toBeInTheDocument();
    expect(
      screen.getByText('Ubicación en Quetzaltenango. Puedes tocar otro punto para cambiarla.'),
    ).toBeInTheDocument();

    rerender(<BranchLocationPicker value={null} onChange={jest.fn()} />);
    expect(
      screen.getByText('Toca el mapa para marcar dónde está la sucursal.'),
    ).toBeInTheDocument();

    rerender(
      <BranchLocationPicker
        value={null}
        onChange={jest.fn()}
        error="Marca la ubicación en el mapa."
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Marca la ubicación en el mapa.');
  });
});
