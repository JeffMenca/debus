import { render, screen } from '@testing-library/react';
import { StatusDot } from './status-dot';

describe('StatusDot', () => {
  it('shows the label with the tone text color', () => {
    render(<StatusDot tone="mint" label="En línea" />);

    expect(screen.getByText('En línea')).toHaveClass('text-mint-700');
  });

  it('pulses only when live and respects reduced motion', () => {
    const { container } = render(<StatusDot tone="mango" label="Esperando" live />);

    expect(container.querySelector('[aria-hidden]')).toHaveClass(
      'animate-pulse-live',
      'motion-reduce:animate-none',
      'bg-mango-300',
    );
  });
});
