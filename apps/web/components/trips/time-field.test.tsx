import { fireEvent, render, screen } from '@testing-library/react';
import { TimeField } from './time-field';

it('shows the label and the time it is given', () => {
  render(<TimeField id="t" label="Hora de salida" value="05:30" onChange={jest.fn()} />);

  expect(screen.getByLabelText('Hora de salida')).toHaveValue('05:30');
  expect(screen.getByLabelText('Hora de salida')).toHaveAttribute('type', 'time');
});

it('reports the time the person picks', () => {
  const onChange = jest.fn();
  render(<TimeField id="t" label="Hora de salida" value="" onChange={onChange} />);

  fireEvent.change(screen.getByLabelText('Hora de salida'), { target: { value: '07:45' } });

  expect(onChange).toHaveBeenLastCalledWith('07:45');
});

it('shows an error and marks the control invalid', () => {
  render(
    <TimeField
      id="t"
      label="Hora de salida"
      value=""
      onChange={jest.fn()}
      error="Elige la hora."
    />,
  );

  expect(screen.getByLabelText('Hora de salida')).toBeInvalid();
  expect(screen.getByRole('alert')).toHaveTextContent('Elige la hora.');
});
