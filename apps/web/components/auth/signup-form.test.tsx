import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SignupForm } from './signup-form';
import { useHydrated } from '../../hooks/use-hydrated';

jest.mock('../../hooks/use-hydrated', () => ({ useHydrated: jest.fn(() => true) }));
const fetchMock = jest.fn();
beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

async function fillRequired() {
  await userEvent.type(screen.getByLabelText('Nombre completo'), 'Ana López');
  await userEvent.type(screen.getByLabelText('DPI'), '2345 67890 1234');
  await userEvent.type(screen.getByLabelText('Teléfono'), '5555 4444');
  await userEvent.type(screen.getByLabelText('Correo'), 'ana@correo.com');
}

describe('SignupForm', () => {
  it('asks for no password and marks NIT and address as optional', () => {
    render(<SignupForm />);

    expect(screen.getByRole('heading', { name: 'Crea tu cuenta' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Contraseña/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/NIT/)).toBeInTheDocument();
    expect(screen.getAllByText('(opcional)')).toHaveLength(2);
    expect(screen.getByText(/aparecerán en tu historial/)).toBeInTheDocument();
  });

  it('sends the profile and asks to check the inbox', async () => {
    fetchMock.mockResolvedValue(Response.json({ message: 'ok' }, { status: 202 }));
    render(<SignupForm />);

    await fillRequired();
    await userEvent.click(screen.getByRole('button', { name: /Crear cuenta/ }));

    expect(await screen.findByRole('heading', { name: 'Revisa tu correo' })).toBeInTheDocument();
    expect(screen.getByText(/ana@correo.com/)).toBeInTheDocument();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      fullName: 'Ana López',
      email: 'ana@correo.com',
      dpi: '2345678901234',
      phone: '55554444',
    });
  });

  it('sends the optional NIT and address when given', async () => {
    fetchMock.mockResolvedValue(Response.json({ message: 'ok' }, { status: 202 }));
    render(<SignupForm />);

    await fillRequired();
    await userEvent.type(screen.getByLabelText(/NIT/), '1234567-k');
    await userEvent.type(screen.getByLabelText(/Dirección/), 'Zona 1, Guatemala');
    await userEvent.click(screen.getByRole('button', { name: /Crear cuenta/ }));

    await screen.findByRole('heading', { name: 'Revisa tu correo' });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      nit: '1234567K',
      address: 'Zona 1, Guatemala',
    });
  });

  it('explains each invalid field', async () => {
    render(<SignupForm />);

    await userEvent.type(screen.getByLabelText('DPI'), '123');
    await userEvent.type(screen.getByLabelText('Teléfono'), '12');
    await userEvent.type(screen.getByLabelText(/NIT/), '12K4');
    await userEvent.click(screen.getByRole('button', { name: /Crear cuenta/ }));

    expect(await screen.findByText('El DPI tiene 13 dígitos.')).toBeInTheDocument();
    expect(screen.getByText('Escribe tu nombre completo.')).toBeInTheDocument();
    expect(screen.getByText('El teléfono tiene 8 dígitos.')).toBeInTheDocument();
    expect(screen.getByText('Escribe un correo válido, como tu@correo.com.')).toBeInTheDocument();
    expect(
      screen.getByText('Revisa el NIT: solo números y, al final, un número o K.'),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows the server message when the request fails', async () => {
    fetchMock.mockResolvedValue(
      Response.json(
        { statusCode: 400, error: 'Bad Request', message: 'Revisa los datos.' },
        { status: 400 },
      ),
    );
    render(<SignupForm />);

    await fillRequired();
    await userEvent.click(screen.getByRole('button', { name: /Crear cuenta/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Revisa los datos.');
    expect(screen.getByRole('heading', { name: 'Crea tu cuenta' })).toBeInTheDocument();
  });
});

describe('SignupForm before the page is interactive', () => {
  afterEach(() => jest.mocked(useHydrated).mockReturnValue(true));

  it('posts instead of getting, so a native submit never puts the fields in the address', () => {
    const { container } = render(<SignupForm />);

    expect(container.querySelector('form')).toHaveAttribute('method', 'post');
  });

  it('keeps the submit button off until the page can handle the submit', () => {
    jest.mocked(useHydrated).mockReturnValue(false);
    const view = render(<SignupForm />);

    expect(screen.getByRole('button', { name: /Crear cuenta/ })).toBeDisabled();

    jest.mocked(useHydrated).mockReturnValue(true);
    view.rerender(<SignupForm />);

    expect(screen.getByRole('button', { name: /Crear cuenta/ })).toBeEnabled();
  });
});
