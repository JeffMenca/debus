import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ForgotForm } from './forgot-form';

const fetchMock = jest.fn();
beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe('ForgotForm', () => {
  it('asks for the email and links back to the login', () => {
    render(<ForgotForm />);

    expect(screen.getByRole('heading', { name: '¿Olvidaste tu contraseña?' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver a iniciar sesión' })).toHaveAttribute(
      'href',
      '/login',
    );
  });

  it('sends the email and says the link lasts one hour', async () => {
    fetchMock.mockResolvedValue(Response.json({ message: 'ok' }, { status: 202 }));
    render(<ForgotForm />);

    await userEvent.type(screen.getByLabelText('Correo electrónico'), 'Ana@Correo.com');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar enlace' }));

    expect(await screen.findByRole('heading', { name: 'Revisa tu correo' })).toBeInTheDocument();
    expect(screen.getByText(/Vence en 1 hora/)).toBeInTheDocument();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ email: 'ana@correo.com' });
  });

  it('explains a malformed email', async () => {
    render(<ForgotForm />);

    await userEvent.type(screen.getByLabelText('Correo electrónico'), 'nope');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar enlace' }));

    expect(
      await screen.findByText('Escribe un correo válido, como tu@correo.com.'),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows the server message when the request fails', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    render(<ForgotForm />);

    await userEvent.type(screen.getByLabelText('Correo electrónico'), 'ana@correo.com');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar enlace' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos conectarnos.');
  });
});
