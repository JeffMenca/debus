import { render, screen } from '@testing-library/react';
import { Button } from './button';

describe('Button', () => {
  it('fills a disabled solid button, which has nothing else to show it is off', () => {
    render(<Button disabled>Guardar</Button>);

    expect(screen.getByRole('button')).toHaveClass('disabled:bg-muted-2');
  });

  it('keeps a disabled ghost button flat, so it never outshines the ones that work', () => {
    render(
      <Button variant="ghost" disabled>
        Anterior
      </Button>,
    );

    const button = screen.getByRole('button');
    expect(button).toHaveClass('disabled:bg-transparent');
    expect(button).not.toHaveClass('disabled:bg-muted-2');
  });

  it('draws the arrow only when asked', () => {
    const { container, rerender } = render(<Button>Seguir</Button>);
    expect(container.querySelector('svg')).toBeNull();

    rerender(<Button arrow>Seguir</Button>);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});
