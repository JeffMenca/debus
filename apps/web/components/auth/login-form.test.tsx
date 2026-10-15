import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { clearSession } from '@/lib/auth/session-store';
import { LoginForm } from './login-form';
import { useHydrated } from '../../hooks/use-hydrated';

const replace = jest.fn();
jest.mock('../../hooks/use-hydrated', () => ({ useHydrated: jest.fn(() => true) }));
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
const fetchMock = jest.fn();
beforeEach(() => {
  replace.mockReset();
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => clearSession());
const user = (role: string) => ({
  accessToken: 'a',
  accessExpiresIn: 900,
  user: {
    id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    fullName: 'Ana',
    email: 'a@b.com',
    role,
    branchId: null,
  },
});

async function fill(email = 'ana@correo.com', password = 'clave-segura-1') {
  if (email) await userEvent.type(screen.getByLabelText('Correo electrónico'), email);
  if (password) await userEvent.type(screen.getByLabelText('Contraseña'), password);
  await userEvent.click(screen.getByRole('button', { name: /Ingresar/ }));
}

describe('LoginForm', () => {
  it('greets the person and offers both tabs', () => {
    render(<LoginForm next={null} />);

    expect(screen.getByRole('heading', { name: 'Hola de nuevo' })).toBeInTheDocument();
    expect(screen.getByText('Ingresa para ver tus viajes y tu saldo.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Iniciar sesión' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('sends a branch admin to the branch home', async () => {
    fetchMock.mockResolvedValue(Response.json(user('BRANCH_ADMIN')));
    render(<LoginForm next={null} />);

    await fill();

    expect(replace).toHaveBeenCalledWith('/sucursal');
  });

  it('returns to the requested page', async () => {
    fetchMock.mockResolvedValue(Response.json(user('SYSTEM_ADMIN')));
    render(<LoginForm next="/admin/usuarios" />);

    await fill();

    expect(replace).toHaveBeenCalledWith('/admin/usuarios');
  });

  it('ignores a next path that leaves the site', async () => {
    fetchMock.mockResolvedValue(Response.json(user('CLIENT')));
    render(<LoginForm next="//evil.example" />);

    await fill();

    expect(replace).toHaveBeenCalledWith('/');
  });

  it('shows the message from the server and keeps what was typed', async () => {
    fetchMock.mockResolvedValue(
      Response.json(
        {
          statusCode: 401,
          error: 'Unauthorized',
          message: 'El correo o la contraseña no coinciden.',
        },
        { status: 401 },
      ),
    );
    render(<LoginForm next={null} />);

    await fill();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El correo o la contraseña no coinciden.',
    );
    expect(screen.getByLabelText('Correo electrónico')).toHaveValue('ana@correo.com');
    expect(screen.getByRole('button', { name: /Ingresar/ })).toBeEnabled();
  });

  it('shows a friendly message when the network fails', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    render(<LoginForm next={null} />);

    await fill();

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos conectarnos.');
  });

  it('disables the button while signing in', async () => {
    fetchMock.mockReturnValue(new Promise(() => undefined));
    render(<LoginForm next={null} />);

    await fill();

    expect(await screen.findByRole('button', { name: 'Ingresando...' })).toBeDisabled();
  });

  it('explains a malformed email before calling the server', async () => {
    render(<LoginForm next={null} />);

    await fill('no-es-correo');

    expect(
      await screen.findByText('Escribe un correo válido, como tu@correo.com.'),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('asks for the password when it is empty', async () => {
    render(<LoginForm next={null} />);

    await fill('ana@correo.com', '');

    expect(await screen.findByText('Escribe tu contraseña.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('confirms a freshly created password', () => {
    render(<LoginForm next={null} notice="passwordSet" />);

    expect(screen.getByRole('status')).toHaveTextContent(
      'Tu contraseña quedó lista. Ya puedes ingresar.',
    );
  });

  it('links to password recovery', () => {
    render(<LoginForm next={null} />);

    expect(screen.getByRole('link', { name: '¿La olvidaste?' })).toHaveAttribute(
      'href',
      '/recuperar',
    );
  });
});

describe('LoginForm before the page is interactive', () => {
  afterEach(() => jest.mocked(useHydrated).mockReturnValue(true));

  it('posts instead of getting, so a native submit never puts the fields in the address', () => {
    const { container } = render(<LoginForm next={null} />);

    expect(container.querySelector('form')).toHaveAttribute('method', 'post');
  });

  it('keeps the submit button off until the page can handle the submit', () => {
    jest.mocked(useHydrated).mockReturnValue(false);
    const view = render(<LoginForm next={null} />);

    expect(screen.getByRole('button', { name: /Ingresar/ })).toBeDisabled();

    jest.mocked(useHydrated).mockReturnValue(true);
    view.rerender(<LoginForm next={null} />);

    expect(screen.getByRole('button', { name: /Ingresar/ })).toBeEnabled();
  });
});
