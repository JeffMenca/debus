import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import AuthLayout from './layout';
import CreatePasswordPage from './crear-contrasena/page';
import LoginPage from './login/page';
import ForgotPage from './recuperar/page';
import SignupPage from './registro/page';
import ResetPasswordPage from './restablecer/page';

jest.mock('next/navigation', () => ({ useRouter: () => ({ replace: jest.fn() }) }));
const fetchMock = jest.fn();
beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

const withQuery = (ui: ReactElement) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {ui}
    </QueryClientProvider>,
  );
const params = (values: Record<string, string | string[] | undefined>) =>
  ({ searchParams: Promise.resolve(values) }) as never;

describe('access pages', () => {
  it('wraps every page in the travel scene', () => {
    render(
      <AuthLayout>
        <p>contenido</p>
      </AuthLayout>,
    );

    expect(screen.getByText('contenido')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('shows the login with the password-ready notice', async () => {
    render(await LoginPage(params({ listo: '1', siguiente: '/admin' })));

    expect(screen.getByRole('heading', { name: 'Hola de nuevo' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Tu contraseña quedó lista');
  });

  it('shows the plain login without a notice', async () => {
    render(await LoginPage(params({})));

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows the sign up and recovery forms', () => {
    const { unmount } = render(<SignupPage />);
    expect(screen.getByRole('heading', { name: 'Crea tu cuenta' })).toBeInTheDocument();
    unmount();

    render(<ForgotPage />);
    expect(screen.getByRole('heading', { name: '¿Olvidaste tu contraseña?' })).toBeInTheDocument();
  });

  it.each([
    ['activation', CreatePasswordPage, 'Crea tu contraseña'],
    ['reset', ResetPasswordPage, 'Elige una nueva contraseña'],
  ] as const)('opens the %s link from the token in the address', async (_name, Page, title) => {
    fetchMock.mockResolvedValue(Response.json({ state: 'valid' }));

    withQuery(await Page(params({ token: 'abc' })));

    expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ token: 'abc' });
  });

  it('treats a missing token as a broken link', async () => {
    withQuery(await CreatePasswordPage(params({})));

    expect(
      await screen.findByRole('heading', { name: 'No pudimos abrir este enlace' }),
    ).toBeInTheDocument();
  });
});
