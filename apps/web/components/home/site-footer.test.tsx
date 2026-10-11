import { act, render, screen, within } from '@testing-library/react';
import { clearSession, setSession } from '@/lib/auth/session-store';
import { SiteFooter } from './site-footer';

const session = (role: 'CLIENT' | 'BRANCH_ADMIN' | 'SYSTEM_ADMIN') => ({
  accessToken: 'a',
  accessExpiresIn: 900,
  user: {
    id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    fullName: 'Ana López',
    email: 'ana@correo.com',
    role,
    branchId: null,
  },
});

afterEach(() => act(() => clearSession()));

describe('SiteFooter', () => {
  // The store keeps its state for the whole file, so this one has to run first.
  it('shows no links and no list while the session is being checked', () => {
    const { container } = render(<SiteFooter year={2030} />);

    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(container.querySelector('[data-testid="footer-account-checking"]')).not.toBeNull();
  });

  it('is the page footer: brand, phrase and the fixed year', () => {
    act(() => clearSession());
    render(<SiteFooter year={2030} />);

    const footer = screen.getByRole('contentinfo');
    expect(within(footer).getByText('debus')).toBeInTheDocument();
    expect(
      within(footer).getByText('Boletos, viajes y alquiler de buses en Guatemala.'),
    ).toBeInTheDocument();
    expect(within(footer).getByText('© 2030 debus. Hecho en Guatemala.')).toBeInTheDocument();
  });

  it('takes the current year when none is given', () => {
    jest.useFakeTimers().setSystemTime(new Date('2031-03-04T12:00:00Z'));
    act(() => clearSession());
    render(<SiteFooter />);
    jest.useRealTimers();

    expect(screen.getByText('© 2031 debus. Hecho en Guatemala.')).toBeInTheDocument();
  });

  it('gives a visitor the three ways in, under "Enlaces del pie"', () => {
    act(() => clearSession());
    render(<SiteFooter year={2030} />);

    const nav = screen.getByRole('navigation', { name: 'Enlaces del pie' });
    expect(within(nav).getByRole('heading', { level: 2, name: 'Tu cuenta' })).toBeInTheDocument();
    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Iniciar sesión', 'Crear cuenta', '¿Olvidaste tu contraseña?']);
    expect(within(nav).getByRole('link', { name: 'Iniciar sesión' })).toHaveAttribute(
      'href',
      '/login',
    );
    expect(within(nav).getByRole('link', { name: 'Crear cuenta' })).toHaveAttribute(
      'href',
      '/registro',
    );
    expect(within(nav).getByRole('link', { name: '¿Olvidaste tu contraseña?' })).toHaveAttribute(
      'href',
      '/recuperar',
    );
  });

  it.each([
    ['BRANCH_ADMIN', '/sucursal'],
    ['SYSTEM_ADMIN', '/admin'],
  ] as const)('sends a signed-in %s to the panel and nothing else', (role, path) => {
    act(() => setSession(session(role)));
    render(<SiteFooter year={2030} />);

    const nav = screen.getByRole('navigation', { name: 'Enlaces del pie' });
    expect(within(nav).getAllByRole('link')).toHaveLength(1);
    expect(within(nav).getByRole('link', { name: 'Ir a mi panel' })).toHaveAttribute('href', path);
  });

  it('shows a client no account column, since the header already greets them', () => {
    act(() => setSession(session('CLIENT')));
    render(<SiteFooter year={2030} />);

    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Tu cuenta' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('© 2030 debus. Hecho en Guatemala.')).toBeInTheDocument();
  });

  it('is colored with the sidebar tokens, with no borders and no loose hex', () => {
    act(() => clearSession());
    const { container } = render(<SiteFooter year={2030} />);

    expect(screen.getByRole('contentinfo')).toHaveClass('bg-sidebar', 'text-sidebar-foreground');
    // The brand illustration carries its own palette.
    const footer = container.cloneNode(true) as HTMLElement;
    footer.querySelector('[data-bus]')?.remove();
    expect(footer.innerHTML).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(footer.innerHTML).not.toMatch(/\bborder\b/);
  });

  it('draws a decorative road with a small mango bus that stops with reduced motion', () => {
    act(() => clearSession());
    const { container } = render(<SiteFooter year={2030} />);

    const road = container.querySelector('[data-testid="footer-road"]');
    expect(road).toHaveAttribute('aria-hidden', 'true');
    expect(road?.querySelector('[data-bus]')).not.toBeNull();
    const own = Array.from(road!.querySelectorAll('[class*="animate-"]')).filter(
      (element) => !element.closest('[data-bus] svg'),
    );
    expect(own.length).toBeGreaterThan(1);
    for (const element of own) {
      expect(element.getAttribute('class')).toContain('motion-reduce:animate-none');
    }
  });
});
