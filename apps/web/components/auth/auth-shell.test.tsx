import { render, screen } from '@testing-library/react';
import { AuthShell } from './auth-shell';

it('puts the travel scene next to the page content', () => {
  render(
    <AuthShell>
      <p>tarjeta</p>
    </AuthShell>,
  );

  expect(screen.getByRole('main')).toContainElement(screen.getByText('tarjeta'));
  expect(
    screen.getByRole('heading', { level: 1, name: 'Tu próximo viaje empieza aquí.' }),
  ).toBeInTheDocument();
});
