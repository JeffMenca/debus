import { render } from '@testing-library/react';
import { Bus } from './bus';

describe('Bus', () => {
  it('animates wheels and body while moving', () => {
    const { container } = render(<Bus tone="coral" />);

    expect(container.querySelectorAll('.animate-wheel')).toHaveLength(2);
    expect(container.querySelector('.animate-bob')).toBeInTheDocument();
  });

  it('stands still when it is not moving', () => {
    const { container } = render(<Bus moving={false} />);

    expect(container.querySelector('.animate-wheel')).not.toBeInTheDocument();
    expect(container.querySelector('.animate-puff')).not.toBeInTheDocument();
  });
});
