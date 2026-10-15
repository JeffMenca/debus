import { render, screen } from '@testing-library/react';
import { KpiCard } from './kpi-card';

const originalMatchMedia = window.matchMedia;

// Shows the final value at once, so the tests do not wait for the count-up.
const reduceMotion = () => {
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)',
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
};

afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

describe('KpiCard', () => {
  beforeEach(reduceMotion);

  it('shows the label and the final value formatted', () => {
    render(
      <KpiCard tone="mango" value={1250} label="Depreciación vigente" format={(n) => `Q${n}`} />,
    );

    expect(screen.getByText('Depreciación vigente')).toBeInTheDocument();
    expect(screen.getByText('Q1250')).toBeInTheDocument();
  });

  it('formats whole numbers for Guatemala by default', () => {
    render(<KpiCard tone="mint" value={12345} label="Usuarios activos" />);

    expect(screen.getByText(/12\D?345/)).toBeInTheDocument();
  });

  it('paints the card with the tone tokens and hides the decorative circle', () => {
    const { container } = render(<KpiCard tone="coral" value={3} label="Pendientes" />);

    expect(container.firstChild).toHaveClass('bg-coral-100', 'text-coral-700');
    const circle = container.querySelector('[aria-hidden]');
    expect(circle).toHaveClass('bg-coral-300', 'motion-reduce:animate-none');
  });

  it('shows an illustration instead of the circle when it is given one', () => {
    const { container } = render(
      <KpiCard tone="mint" value={2} label="En camino" art={<svg data-testid="art" />} />,
    );

    expect(screen.getByTestId('art')).toBeInTheDocument();
    expect(container.querySelector('.animate-float')).toBeNull();
    expect(screen.getByText('En camino')).toBeInTheDocument();
  });
});

describe('KpiCard hint', () => {
  it('says what the number counts under the label', () => {
    reduceMotion();
    render(<KpiCard tone="mint" value={3} label="Ingresos" hint="Boletos y alquileres" />);

    expect(screen.getByText('Boletos y alquileres')).toBeInTheDocument();
  });
});

describe('the simulated reduced motion', () => {
  it('does not leak into the tests that run after it', () => {
    expect(window.matchMedia('(prefers-reduced-motion: reduce)').matches).toBe(false);
  });
});
