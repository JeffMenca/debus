import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PasswordInput } from './password-input';

it('shows and hides the password', async () => {
  render(<PasswordInput id="p" aria-label="Contraseña" />);
  const input = screen.getByLabelText('Contraseña');

  expect(input).toHaveAttribute('type', 'password');
  await userEvent.click(screen.getByRole('button', { name: 'Mostrar contraseña' }));
  expect(input).toHaveAttribute('type', 'text');
  await userEvent.click(screen.getByRole('button', { name: 'Ocultar contraseña' }));
  expect(input).toHaveAttribute('type', 'password');
});
