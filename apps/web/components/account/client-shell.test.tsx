import { render, screen } from '@testing-library/react';
import { ClientShell } from './client-shell';

let pathname = '/cuenta';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  usePathname: () => pathname,
}));

const renderShell = () =>
  render(
    <ClientShell>
      <p>contenido</p>
    </ClientShell>,
  );

describe('ClientShell', () => {
  it('frames the page with the logo, the links of the client and the way out', () => {
    pathname = '/cuenta';
    renderShell();

    expect(screen.getByRole('main')).toContainElement(screen.getByText('contenido'));
    expect(screen.getByRole('link', { name: 'debus, página de inicio' })).toHaveAttribute(
      'href',
      '/',
    );
    expect(screen.getByRole('link', { name: 'Viajes' })).toHaveAttribute('href', '/viajes');
    expect(screen.getByRole('link', { name: 'Viajes' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Alquilar un bus' })).toHaveAttribute(
      'href',
      '/alquiler',
    );
    expect(screen.getByRole('link', { name: 'Mi cuenta' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
  });

  it('keeps the trips link active while the client chooses seats', () => {
    pathname = '/viajes/5b4a3f2e-1d0c-4b9a-8f7e-6d5c4b3a2f1e/asientos';
    renderShell();

    expect(screen.getByRole('link', { name: 'Viajes' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Mi cuenta' })).not.toHaveAttribute('aria-current');
  });
});
