import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { clearSession, getSessionStatus, setSession } from '@/lib/auth/session-store';
import { queryWrapper } from '../test-support/query-wrapper';
import HomePage from './page';

// The store keeps its state between tests, so the "checking" state is forced instead.
const mockStatus = jest.fn();
jest.mock('../lib/auth/session-store', () => {
  const actual = jest.requireActual('../lib/auth/session-store');
  return { ...actual, useSessionStatus: () => mockStatus() };
});

const fetchMock = jest.fn();
beforeEach(() => {
  mockStatus.mockImplementation(getSessionStatus);
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => act(() => clearSession()));

const session = (role: 'SYSTEM_ADMIN' | 'BRANCH_ADMIN' | 'CLIENT', fullName = 'Ana López') => ({
  accessToken: 'a',
  accessExpiresIn: 900,
  user: {
    id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    fullName,
    email: 'ana@correo.com',
    role,
    branchId: role === 'BRANCH_ADMIN' ? '8f9e6679-7425-40de-944b-e07fc1f90ae7' : null,
  },
});

const header = () => screen.getByRole('navigation', { name: /^(Acceso|Tu cuenta)$/ });
const footer = () => screen.getByRole('contentinfo');

describe('HomePage', () => {
  it('shows no account links while the session is being checked', () => {
    mockStatus.mockReturnValue('unknown');
    render(<HomePage />, { wrapper: queryWrapper().wrapper });

    // Only the scroll-down button, which is for everybody, is there.
    expect(screen.getAllByRole('link').map((link) => link.getAttribute('aria-label'))).toEqual([
      'Ver más contenido',
    ]);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('puts the logo and the access links in the banner of the page, outside the main region', () => {
    act(() => clearSession());
    render(<HomePage />, { wrapper: queryWrapper().wrapper });

    const banner = screen.getByRole('banner');
    expect(screen.getByRole('main')).not.toContainElement(banner);
    expect(within(banner).getByText('debus')).toBeInTheDocument();
    expect(banner).toContainElement(header());
    expect(screen.getAllByRole('banner')).toHaveLength(1);
  });

  it('presents the brand promise and the benefits', () => {
    act(() => clearSession());
    render(<HomePage />, { wrapper: queryWrapper().wrapper });

    expect(
      screen.getByRole('heading', { level: 1, name: 'Tu próximo viaje empieza aquí.' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Compra tus boletos' })).toBeInTheDocument();
  });

  it('offers a visitor the login and the sign-up, with a single primary action', () => {
    act(() => clearSession());
    render(<HomePage />, { wrapper: queryWrapper().wrapper });

    const logIn = within(header()).getByRole('link', { name: 'Iniciar sesión' });
    const signUp = within(header()).getByRole('link', { name: 'Crear cuenta' });
    expect(logIn).toHaveAttribute('href', '/login');
    expect(logIn).not.toHaveClass('bg-primary');
    expect(signUp).toHaveAttribute('href', '/registro');
    expect(signUp).toHaveClass('bg-primary');
    expect(screen.queryByRole('link', { name: 'Ir a mi panel' })).not.toBeInTheDocument();
    // The sign-up in the header is the only filled button of the page.
    expect(document.querySelectorAll('a.bg-primary, button.bg-primary')).toHaveLength(1);
  });

  it('sends staff to their own panel', () => {
    act(() => setSession(session('BRANCH_ADMIN')));
    render(<HomePage />, { wrapper: queryWrapper().wrapper });

    expect(within(header()).getByRole('link', { name: 'Ir a mi panel' })).toHaveAttribute(
      'href',
      '/sucursal',
    );
    expect(within(footer()).getByRole('link', { name: 'Ir a mi panel' })).toHaveAttribute(
      'href',
      '/sucursal',
    );
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Iniciar sesión' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Crear cuenta' })).not.toBeInTheDocument();
  });

  it('greets a client by first name and does not offer a panel', () => {
    act(() => setSession(session('CLIENT')));
    render(<HomePage />, { wrapper: queryWrapper().wrapper });

    expect(screen.getByText('Hola, Ana')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Hola, Ana. Ir a mi cuenta' })).toHaveAttribute(
      'href',
      '/cuenta',
    );
    expect(screen.queryByRole('link', { name: 'Ir a mi panel' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
  });

  it('greets a client whose name is a single word', () => {
    act(() => setSession(session('CLIENT', '  Ana ')));
    render(<HomePage />, { wrapper: queryWrapper().wrapper });

    expect(screen.getByText('Hola, Ana')).toBeInTheDocument();
  });

  it('closes the session and stays on the home page', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    act(() => setSession(session('CLIENT')));
    render(<HomePage />, { wrapper: queryWrapper().wrapper });

    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));

    expect(fetchMock).toHaveBeenCalledWith('/api/session/logout', expect.anything());
    expect(
      await within(await screen.findByRole('navigation', { name: 'Acceso' })).findByRole('link', {
        name: 'Iniciar sesión',
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Hola, Ana')).not.toBeInTheDocument();
  });

  it('moves the keyboard focus to the login link after signing out', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    act(() => setSession(session('CLIENT')));
    render(<HomePage />, { wrapper: queryWrapper().wrapper });
    screen.getByRole('button', { name: 'Cerrar sesión' }).focus();

    await userEvent.keyboard('{Enter}');

    const nav = await screen.findByRole('navigation', { name: 'Acceso' });
    expect(within(nav).getByRole('link', { name: 'Iniciar sesión' })).toHaveFocus();
  });

  it('tells the story from top to bottom, with one h1 and the footer last', () => {
    act(() => clearSession());
    const { container } = render(<HomePage />, { wrapper: queryWrapper().wrapper });

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(
      screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent),
    ).toEqual([
      'Compra tus boletos',
      'Elige tu asiento',
      'Alquila un bus para tu grupo',
      'Conectamos todo el país',
      'Preguntas frecuentes',
      '¿Viajas en grupo?',
      'Tu cuenta',
    ]);
    expect(screen.getByRole('main')).toContainElement(screen.getByRole('img', { name: /^Mapa/ }));
    // The footer is a sibling of the main region, otherwise it is not the page footer.
    expect(screen.getByRole('main')).not.toContainElement(footer());
    expect(container.lastElementChild).toBe(footer());
  });

  it('puts the scroll-down button on the hero, for every kind of visitor, pointing at the benefits', () => {
    act(() => clearSession());
    const { unmount } = render(<HomePage />, { wrapper: queryWrapper().wrapper });
    expect(screen.getByRole('link', { name: 'Ver más contenido' })).toHaveAttribute(
      'href',
      '#beneficios',
    );
    expect(document.getElementById('beneficios')).toBeInTheDocument();
    unmount();

    act(() => setSession(session('CLIENT')));
    render(<HomePage />, { wrapper: queryWrapper().wrapper });
    expect(screen.getByRole('link', { name: 'Ver más contenido' })).toBeInTheDocument();
  });

  it('keeps the questions before the rental band and the decorative circles out of the tree', () => {
    act(() => clearSession());
    const { container } = render(<HomePage />, { wrapper: queryWrapper().wrapper });

    const faq = screen.getByRole('heading', { name: 'Preguntas frecuentes' });
    const rental = screen.getByRole('heading', { name: '¿Viajas en grupo?' });
    expect(faq.compareDocumentPosition(rental) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.querySelectorAll('div > [aria-hidden="true"].-z-10')).toHaveLength(1);
  });

  it('offers a visitor the rental quote through the sign-up, and nobody else', async () => {
    act(() => clearSession());
    render(<HomePage />, { wrapper: queryWrapper().wrapper });
    const quote = 'Crea tu cuenta para pedir tu cotización';

    expect(screen.getByRole('link', { name: quote })).toHaveAttribute('href', '/registro');
    act(() => setSession(session('CLIENT')));
    expect(screen.queryByRole('link', { name: quote })).not.toBeInTheDocument();
  });

  it('shows the year in the footer', () => {
    jest.useFakeTimers().setSystemTime(new Date('2031-03-04T12:00:00Z'));
    act(() => clearSession());
    render(<HomePage />, { wrapper: queryWrapper().wrapper });
    jest.useRealTimers();

    expect(within(footer()).getByText('© 2031 debus. Hecho en Guatemala.')).toBeInTheDocument();
  });
});
