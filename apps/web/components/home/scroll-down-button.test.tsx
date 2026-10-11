import { render, screen } from '@testing-library/react';
import { ScrollDownButton } from './scroll-down-button';

describe('ScrollDownButton', () => {
  it('is a link to the benefits, named for what it does', () => {
    render(<ScrollDownButton />);

    expect(screen.getByRole('link', { name: 'Ver más contenido' })).toHaveAttribute(
      'href',
      '#beneficios',
    );
  });

  it('is a round 44px floating control on the card color, and not a primary action', () => {
    render(<ScrollDownButton />);

    const link = screen.getByRole('link');
    expect(link).toHaveClass('size-11', 'rounded-full', 'bg-card', 'shadow-float');
    expect(link).not.toHaveClass('bg-primary');
    expect(link).toHaveClass('focus-visible:outline-2', 'focus-visible:outline-ring');
  });

  it('bounces softly and stops with reduced motion', () => {
    render(<ScrollDownButton />);

    expect(screen.getByRole('link')).toHaveClass(
      'animate-bounce-soft',
      'motion-reduce:animate-none',
    );
  });

  it('sits half over the edge of the hero without taking room in the flow', () => {
    const { container } = render(<ScrollDownButton />);

    expect(container.firstElementChild).toHaveClass('absolute', 'bottom-0', 'translate-y-1/2');
    expect(container.firstElementChild).toHaveClass('pointer-events-none');
    expect(screen.getByRole('link')).toHaveClass('pointer-events-auto');
  });

  it('hides its arrow from screen readers', () => {
    const { container } = render(<ScrollDownButton />);

    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});
