import { render, screen } from '@testing-library/react';
import { ClientShell } from './client-shell';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  usePathname: () => '/cuenta',
}));

describe('ClientShell', () => {
  it('frames the page with the logo, the account link and the way out', () => {
    render(
      <ClientShell>
        <p>contenido</p>
      </ClientShell>,
    );

    expect(screen.getByRole('main')).toContainElement(screen.getByText('contenido'));
    expect(screen.getByRole('link', { name: 'debus, página de inicio' })).toHaveAttribute(
      'href',
      '/',
    );
    expect(screen.getByRole('link', { name: 'Mi cuenta' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
  });
});
