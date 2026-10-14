import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SetPasswordForm } from './set-password-form';
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

async function submit(password: string, confirm: string) {
  await userEvent.type(screen.getByLabelText('Contraseña'), password);
  await userEvent.type(screen.getByLabelText('Repite tu contraseña'), confirm);
  await userEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }));
}
const failure = (status: number, message: string) =>
  Response.json({ statusCode: status, error: 'Error', message }, { status });

describe('SetPasswordForm', () => {
  it('titles the screen by purpose', () => {
    const { rerender } = render(<SetPasswordForm token="t" purpose="ACTIVATION" />);
    expect(screen.getByRole('heading', { name: 'Crea tu contraseña' })).toBeInTheDocument();
    expect(
      screen.getByText('Elige una contraseña que solo tú conozcas. Usa al menos 8 caracteres.'),
    ).toBeInTheDocument();

    rerender(<SetPasswordForm token="t" purpose="PASSWORD_RESET" />);
    expect(screen.getByRole('heading', { name: 'Elige una nueva contraseña' })).toBeInTheDocument();
    expect(screen.getByText('Al guardarla cerraremos tus otras sesiones.')).toBeInTheDocument();
  });

  it('requires matching passwords of at least 8 characters', async () => {
    render(<SetPasswordForm token="t" purpose="ACTIVATION" />);

    await submit('corta', 'otra');

    expect(await screen.findByText('Usa al menos 8 caracteres.')).toBeInTheDocument();
    expect(screen.getByText('Las contraseñas no coinciden.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('flags only the confirmation when the first password is fine', async () => {
    render(<SetPasswordForm token="t" purpose="ACTIVATION" />);

    await submit('clave-segura-1', 'clave-segura-2');

    expect(await screen.findByText('Las contraseñas no coinciden.')).toBeInTheDocument();
    expect(screen.queryByText('Usa al menos 8 caracteres.')).not.toBeInTheDocument();
  });

  it('saves and sends the person to the login', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    render(<SetPasswordForm token="t" purpose="ACTIVATION" />);

    await submit('clave-segura-1', 'clave-segura-1');

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      token: 't',
      password: 'clave-segura-1',
    });
    expect(replace).toHaveBeenCalledWith('/login?listo=1');
  });

  it('shows the server message when saving fails', async () => {
    fetchMock.mockResolvedValue(failure(400, 'No pudimos guardar la contraseña.'));
    render(<SetPasswordForm token="t" purpose="ACTIVATION" />);

    await submit('clave-segura-1', 'clave-segura-1');

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos guardar la contraseña.');
    expect(replace).not.toHaveBeenCalled();
  });

  it.each([409, 410])('hands over to the link check when the server says %s', async (status) => {
    fetchMock.mockResolvedValue(failure(status, 'El enlace ya no sirve.'));
    const onLinkProblem = jest.fn();
    render(<SetPasswordForm token="t" purpose="ACTIVATION" onLinkProblem={onLinkProblem} />);

    await submit('clave-segura-1', 'clave-segura-1');

    await waitFor(() => expect(onLinkProblem).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('SetPasswordForm before the page is interactive', () => {
  afterEach(() => jest.mocked(useHydrated).mockReturnValue(true));

  it('posts instead of getting, so a native submit never puts the fields in the address', () => {
    const { container } = render(<SetPasswordForm token="t" purpose="ACTIVATION" />);

    expect(container.querySelector('form')).toHaveAttribute('method', 'post');
  });

  it('keeps the submit button off until the page can handle the submit', () => {
    jest.mocked(useHydrated).mockReturnValue(false);
    const view = render(<SetPasswordForm token="t" purpose="ACTIVATION" />);

    expect(screen.getByRole('button', { name: /Guardar contraseña/ })).toBeDisabled();

    jest.mocked(useHydrated).mockReturnValue(true);
    view.rerender(<SetPasswordForm token="t" purpose="ACTIVATION" />);

    expect(screen.getByRole('button', { name: /Guardar contraseña/ })).toBeEnabled();
  });
});
