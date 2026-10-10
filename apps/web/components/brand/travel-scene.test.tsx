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
