import { render, screen } from '@testing-library/react';
import { AuthTabs } from './auth-tabs';

describe('AuthTabs', () => {
  it('links both forms and marks the active one', () => {
    render(<AuthTabs active="registro" />);

    expect(screen.getByRole('link', { name: 'Iniciar sesión' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: 'Crear cuenta' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Iniciar sesión' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('moves the indicator under the active tab', () => {
    const { container, rerender } = render(<AuthTabs active="login" />);
    const indicator = () => container.querySelector('[aria-hidden="true"]');

    expect(indicator()).toHaveClass('translate-x-0');

    rerender(<AuthTabs active="registro" />);

    expect(indicator()).toHaveClass('translate-x-full');
  });
});
