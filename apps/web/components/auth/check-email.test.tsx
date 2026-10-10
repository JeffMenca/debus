import { render, screen } from '@testing-library/react';
import { CheckEmail } from './check-email';

describe('CheckEmail', () => {
  it('names the address and the 48 hours after a sign up', () => {
    render(<CheckEmail kind="signup" email="ana@correo.com" />);

    expect(screen.getByRole('heading', { name: 'Revisa tu correo' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Te enviamos un enlace a ana@correo.com para crear tu contraseña. Vence en 48 horas.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/carpeta de spam/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver a iniciar sesión' })).toHaveAttribute(
      'href',
      '/login',
    );
  });

  it('does not reveal whether the account exists when recovering', () => {
    render(<CheckEmail kind="forgot" email="ana@correo.com" />);

    expect(
      screen.getByText('Si hay una cuenta con ese correo, te llegará un enlace. Vence en 1 hora.'),
    ).toBeInTheDocument();
  });

  it('uses the validity of the renewed link', () => {
    const { rerender } = render(<CheckEmail kind="renew" purpose="ACTIVATION" />);
    expect(screen.getByText(/Vence en 48 horas/)).toBeInTheDocument();

    rerender(<CheckEmail kind="renew" purpose="PASSWORD_RESET" />);
    expect(screen.getByText(/Vence en 1 hora/)).toBeInTheDocument();
  });
});
