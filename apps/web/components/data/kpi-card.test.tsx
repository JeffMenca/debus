import { render, screen } from '@testing-library/react';
import { KpiCard } from './kpi-card';

describe('KpiCard', () => {
  beforeEach(() => {
    window.matchMedia = jest.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
  });

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
});
