import { render, screen } from '@testing-library/react';
import { Field, invalidProps } from './field';

it('labels optional fields and links the error', () => {
  render(
    <Field id="nit" label="NIT" optional error="Revisa el NIT.">
      <input id="nit" aria-describedby="nit-error" />
    </Field>,
  );

  expect(screen.getByText('(opcional)')).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('Revisa el NIT.');
  expect(screen.getByLabelText(/NIT/)).toHaveAttribute('aria-describedby', 'nit-error');
});

it('shows no alert and puts extra content beside the label', () => {
  render(
    <Field id="pass" label="Contraseña" aside={<a href="/x">¿La olvidaste?</a>}>
      <input id="pass" />
    </Field>,
  );

  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: '¿La olvidaste?' })).toBeInTheDocument();
});

describe('invalidProps', () => {
  it('points the control at its error only when there is one', () => {
    expect(invalidProps('nit', 'Revisa el NIT.')).toEqual({
      'aria-invalid': true,
      'aria-describedby': 'nit-error',
    });
    expect(invalidProps('nit', undefined)).toEqual({});
  });
});
