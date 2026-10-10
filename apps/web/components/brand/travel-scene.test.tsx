import { render, screen } from '@testing-library/react';
import { TravelScene } from './travel-scene';

it('shows the brand promise and hides the decoration from screen readers', () => {
  const { container } = render(<TravelScene />);

  expect(
    screen.getByRole('heading', { level: 1, name: 'Tu próximo viaje empieza aquí.' }),
  ).toBeInTheDocument();
  expect(screen.getByText('debus')).toBeInTheDocument();
  expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
});

it('places the given actions on the same row as the logo', () => {
  render(<TravelScene actions={<a href="/login">Entrar</a>} />);

  const logoRow = screen.getByText('debus').closest('div[class*="justify-between"]');
  expect(logoRow).toContainElement(screen.getByRole('link', { name: 'Entrar' }));
});

it('shrinks the logo only when there are actions to share the row with', () => {
  const { rerender } = render(<TravelScene />);
  expect(screen.getByText('debus')).not.toHaveClass('max-sm:text-[22px]');

  rerender(<TravelScene actions={<a href="/login">Entrar</a>} />);
  expect(screen.getByText('debus')).toHaveClass('max-sm:text-[22px]');
});
