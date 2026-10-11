import { todayInGuatemala } from '@debus/contracts';
import { fireEvent, render, screen } from '@testing-library/react';
import { DateField } from './date-field';

it('starts on today, stays editable and explains it', () => {
  const onChange = jest.fn();
  render(
    <DateField
      id="desde"
      label="Vigente desde"
      value={todayInGuatemala()}
      min={todayInGuatemala()}
      onChange={onChange}
    />,
  );
  const input = screen.getByLabelText('Vigente desde');

  expect(input).toHaveAttribute('type', 'date');
  expect(input).toHaveValue(todayInGuatemala());
  expect(input).toHaveAttribute('min', todayInGuatemala());
  expect(screen.getByText('Hoy por defecto, siempre editable')).toBeInTheDocument();
  fireEvent.change(input, { target: { value: '2026-12-24' } });
  expect(onChange).toHaveBeenCalledWith('2026-12-24');
});

it('announces its error instead of the hint', () => {
  render(
    <DateField
      id="desde"
      label="Vigente desde"
      value="2020-01-01"
      onChange={jest.fn()}
      error="Elige hoy o una fecha posterior."
    />,
  );

  expect(screen.getByLabelText('Vigente desde')).toHaveAttribute('aria-invalid', 'true');
  expect(screen.getByRole('alert')).toHaveTextContent('Elige hoy o una fecha posterior.');
  expect(screen.queryByText('Hoy por defecto, siempre editable')).not.toBeInTheDocument();
});

it('accepts its own hint and a maximum', () => {
  render(
    <DateField
      id="hasta"
      label="Hasta"
      value="2026-10-10"
      max="2026-12-31"
      hint="Último día del periodo"
      onChange={jest.fn()}
    />,
  );

  expect(screen.getByText('Último día del periodo')).toBeInTheDocument();
  expect(screen.getByLabelText('Hasta')).toHaveAttribute('max', '2026-12-31');
});
