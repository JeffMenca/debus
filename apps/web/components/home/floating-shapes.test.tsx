import { render } from '@testing-library/react';
import { FloatingShapes } from './floating-shapes';

describe('FloatingShapes', () => {
  it('is decorative, clipped so it can never cause horizontal scroll, and behind the content', () => {
    const { container } = render(<FloatingShapes />);

    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    expect(container.firstElementChild).toHaveClass(
      'absolute',
      'inset-0',
      'overflow-hidden',
      '-z-10',
      'pointer-events-none',
    );
  });

  it('floats mango, mint and lilac circles that stop with reduced motion', () => {
    const { container } = render(<FloatingShapes />);

    for (const tone of ['bg-mango-100', 'bg-mint-100', 'bg-lilac-100']) {
      expect(container.querySelector(`.${tone}`)).not.toBeNull();
    }
    const circles = container.querySelectorAll('.rounded-full');
    expect(circles.length).toBeGreaterThanOrEqual(3);
    for (const circle of circles) {
      expect(circle).toHaveClass('animate-float', 'motion-reduce:animate-none');
    }
  });
});
