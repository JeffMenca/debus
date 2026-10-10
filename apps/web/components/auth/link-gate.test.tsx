import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LinkGate, type LinkGateChildren } from './link-gate';

const fetchMock = jest.fn();
beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});
const renderGate = (token: string | null, children: LinkGateChildren = <p>formulario</p>) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <LinkGate token={token} purpose="ACTIVATION">
        {children}
      </LinkGate>
    </QueryClientProvider>,
  );
const status = (state: string) => Response.json({ state, purpose: 'ACTIVATION' });

describe('LinkGate', () => {
  it('shows a loading card while it checks the link', () => {
    fetchMock.mockReturnValue(new Promise(() => undefined));
    renderGate('t');

    expect(screen.getByRole('status', { name: 'Revisando tu enlace' })).toBeInTheDocument();
    expect(screen.queryByText('formulario')).not.toBeInTheDocument();
  });

  it('shows the form for a valid link', async () => {
    fetchMock.mockResolvedValue(status('valid'));
    renderGate('t');

    expect(await screen.findByText('formulario')).toBeInTheDocument();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ token: 't' });
  });

  it('renews an expired link with one click', async () => {
    fetchMock
      .mockResolvedValueOnce(status('expired'))
      .mockResolvedValueOnce(Response.json({ message: 'ok' }, { status: 202 }));
    renderGate('t');

    expect(
      await screen.findByRole('heading', { name: 'Este enlace ya venció' }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Enviar un enlace nuevo' }));

    expect(await screen.findByRole('heading', { name: 'Revisa tu correo' })).toBeInTheDocument();
    expect(fetchMock.mock.calls[1][0]).toContain('/auth/links/renew');
  });

  it('shows why a renewal failed and lets the person try again', async () => {
    fetchMock
      .mockResolvedValueOnce(status('expired'))
      .mockResolvedValueOnce(
        Response.json(
          { statusCode: 409, error: 'Conflict', message: 'Este enlace ya se usó. Inicia sesión.' },
          { status: 409 },
        ),
      );
    renderGate('t');

    await userEvent.click(await screen.findByRole('button', { name: 'Enviar un enlace nuevo' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Este enlace ya se usó. Inicia sesión.',
    );
    expect(screen.getByRole('button', { name: 'Enviar un enlace nuevo' })).toBeEnabled();
  });

  it('sends used links to the login', async () => {
    fetchMock.mockResolvedValue(status('used'));
    renderGate('t');

    expect(
      await screen.findByRole('heading', { name: 'Este enlace ya se usó' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Tu contraseña ya está lista.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir a iniciar sesión' })).toHaveAttribute(
      'href',
      '/login',
    );
  });

  it('sends unknown links to recovery', async () => {
    fetchMock.mockResolvedValue(status('invalid'));
    renderGate('t');

    expect(
      await screen.findByRole('heading', { name: 'No pudimos abrir este enlace' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pedir un enlace nuevo' })).toHaveAttribute(
      'href',
      '/recuperar',
    );
  });

  it('handles a missing token without calling the server', async () => {
    renderGate(null);

    expect(await screen.findByRole('link', { name: 'Pedir un enlace nuevo' })).toHaveAttribute(
      'href',
      '/recuperar',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('explains a connection failure instead of calling the link broken', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    renderGate('t');

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos conectarnos.');
    expect(screen.getByRole('link', { name: 'Pedir un enlace nuevo' })).toBeInTheDocument();
  });

  it('lets the form ask for a new check', async () => {
    fetchMock.mockResolvedValueOnce(status('valid')).mockResolvedValueOnce(status('expired'));
    renderGate('t', ({ recheck }: { recheck: () => void }) => (
      <button onClick={recheck}>revisar</button>
    ));

    await userEvent.click(await screen.findByRole('button', { name: 'revisar' }));

    expect(
      await screen.findByRole('heading', { name: 'Este enlace ya venció' }),
    ).toBeInTheDocument();
  });
});
