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

  it.each([
    ['sky', 'bg-sky-300', 'text-sky-700'],
    ['muted', 'bg-muted-foreground/50', 'text-muted-foreground'],
  ] as const)('paints the %s tone with tokens', (tone, dot, text) => {
    render(<StatusDot tone={tone} label="Programado" />);

    expect(screen.getByText('Programado')).toHaveClass(text);
    expect(screen.getByText('Programado').firstChild).toHaveClass(dot);
  });
});
