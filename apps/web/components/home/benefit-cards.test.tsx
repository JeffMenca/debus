import { render, screen } from '@testing-library/react';
import { BenefitCards } from './benefit-cards';

describe('BenefitCards', () => {
  it('shows the three benefits with a warm line each', () => {
    render(<BenefitCards />);

    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Compra tus boletos',
      'Elige tu asiento',
      'Alquila un bus para tu grupo',
    ]);
    expect(screen.getByText(/paga en segundos/)).toBeInTheDocument();
    expect(screen.getByText(/junto a la ventana/)).toBeInTheDocument();
    expect(screen.getByText(/confirma el precio antes de pagar/)).toBeInTheDocument();
  });

  it('colors each card with its design tokens and never with loose hex values', () => {
    const { container } = render(<BenefitCards />);

    expect(container.querySelector('.bg-mango-100.text-mango-700')).not.toBeNull();
    expect(container.querySelector('.bg-mint-100.text-mint-700')).not.toBeNull();
    expect(container.querySelector('.bg-coral-100.text-coral-700')).not.toBeNull();
    expect(container.innerHTML).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(container.innerHTML).not.toMatch(/\bborder\b/);
  });

  it('hides the icons from screen readers', () => {
    const { container } = render(<BenefitCards />);

    expect(container.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(3);
  });

  it('is the target of the scroll-down button, leaving room above it', () => {
    const { container } = render(<BenefitCards />);

    expect(container.firstElementChild).toHaveAttribute('id', 'beneficios');
    expect(container.firstElementChild).toHaveClass('scroll-mt-6');
  });
});
