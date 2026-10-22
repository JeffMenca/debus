import { act, render, screen } from '@testing-library/react';
import { clearSession, setSession } from '@/lib/auth/session-store';
import { RentalBand } from './rental-band';

const CTA = 'Crea tu cuenta para pedir tu cotización';

const session = (role: 'CLIENT' | 'BRANCH_ADMIN') => ({
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

describe('RentalBand', () => {
  // The store keeps its state for the whole file, so this one has to run first.
  it('shows no link while the session is being checked, but keeps its room', () => {
    const { container } = render(<RentalBand />);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(container.querySelector('.min-h-6')).not.toBeNull();
  });

  it.each(['CLIENT', 'BRANCH_ADMIN'] as const)(
    'keeps no empty line under the text for a signed-in %s',
    (role) => {
      act(() => setSession(session(role)));
      const { container } = render(<RentalBand />);

      expect(container.querySelector('.min-h-6')).toBeNull();
      act(() => clearSession());
    },
  );

  it('takes a signed-in client straight to ask for a quote', () => {
    act(() => setSession(session('CLIENT')));
    render(<RentalBand />);

    expect(screen.getByRole('link', { name: /Pide tu cotización/ })).toHaveAttribute(
      'href',
      '/alquiler',
    );
    expect(screen.queryByRole('link', { name: CTA })).not.toBeInTheDocument();
    act(() => clearSession());
  });

  it('invites the group and says what is offered', () => {
    act(() => clearSession());
    render(<RentalBand />);

    expect(
      screen.getByRole('heading', { level: 2, name: '¿Viajas en grupo?' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Alquila un bus completo con chofer para tu familia, tu institución o tu empresa.',
      ),
    ).toBeInTheDocument();
  });

  it('sends a visitor to the sign-up to ask for a quote', () => {
    act(() => clearSession());
    render(<RentalBand />);

    expect(screen.getByRole('link', { name: CTA })).toHaveAttribute('href', '/registro');
  });

  it.each(['CLIENT', 'BRANCH_ADMIN'] as const)('offers nothing to a signed-in %s', (role) => {
    act(() => setSession(session(role)));
    render(<RentalBand />);

    expect(screen.queryByRole('link', { name: CTA })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '¿Viajas en grupo?' })).toBeInTheDocument();
    act(() => clearSession());
  });

  it('uses the coral pair, no borders, no loose hex and no primary button', () => {
    act(() => clearSession());
    const { container } = render(<RentalBand />);

    expect(container.querySelector('section.bg-coral-100.text-coral-700')).not.toBeNull();
    // The brand illustration carries its own palette.
    const band = container.cloneNode(true) as HTMLElement;
    band.querySelector('[data-bus]')?.remove();
    expect(band.innerHTML).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(band.innerHTML).not.toMatch(/\bborder\b/);
    expect(band.innerHTML).not.toContain('bg-primary');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows a small bus that stays out of the reading order and stops with reduced motion', () => {
    act(() => clearSession());
    const { container } = render(<RentalBand />);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(container.querySelector('[data-bus]')).toHaveAttribute('aria-hidden', 'true');
    const own = Array.from(container.querySelectorAll('[class*="animate-"]')).filter(
      (element) => !element.closest('[data-bus] svg'),
    );
    expect(own.length).toBeGreaterThan(0);
    for (const element of own) {
      expect(element.getAttribute('class')).toContain('motion-reduce:animate-none');
    }
  });
});
