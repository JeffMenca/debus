import { fireEvent, render, screen } from '@testing-library/react';
import { inputRules } from '@/lib/forms/input-rules';
import { Input } from './input';

describe('Input', () => {
  it('cleans a paste before the received onChange reads it', () => {
    const seen: string[] = [];
    render(
      <Input
        aria-label="Teléfono"
        rule={inputRules.phone}
        onChange={(event) => seen.push(event.target.value)}
      />,
    );
    const input = screen.getByRole<HTMLInputElement>('textbox', { name: 'Teléfono' });

    fireEvent.change(input, { target: { value: '5555-4444-99' } });

    expect(input.value).toBe('55554444');
    expect(seen).toEqual(['55554444']);
  });

  it('keeps the caret where the person was typing', () => {
    render(<Input aria-label="Teléfono" rule={inputRules.phone} />);
    const input = screen.getByRole<HTMLInputElement>('textbox', { name: 'Teléfono' });
    fireEvent.change(input, { target: { value: '1234' } });

    fireEvent.change(input, { target: { value: '12a34', selectionStart: 3, selectionEnd: 3 } });

    expect(input.value).toBe('1234');
    expect(input.selectionStart).toBe(2);
  });

  it('leaves the value alone when the rule has nothing to clean', () => {
    const onChange = jest.fn();
    render(
      <Input aria-label="Correo" rule={inputRules.email} defaultValue="" onChange={onChange} />,
    );
    const input = screen.getByRole<HTMLInputElement>('textbox', { name: 'Correo' });

    fireEvent.change(input, { target: { value: 'ana@correo.com' } });

    expect(input.value).toBe('ana@correo.com');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('passes the keyboard and the length of the rule to the browser', () => {
    render(<Input aria-label="Correo" rule={inputRules.email} />);
    const input = screen.getByRole('textbox', { name: 'Correo' });
    expect(input).toHaveAttribute('inputmode', 'email');
    expect(input).toHaveAttribute('maxlength', '254');
  });
});
