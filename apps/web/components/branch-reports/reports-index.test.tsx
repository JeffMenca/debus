import { render, screen } from '@testing-library/react';
import { ReportsIndex } from './reports-index';

jest.mock('../../hooks/use-own-branch', () => ({
  useOwnBranch: () => ({ id: 'br', name: 'Quetzaltenango' }),
}));

describe('ReportsIndex', () => {
  beforeEach(() => {
    window.matchMedia = jest.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
  });

  it('shows a card with a link for every available report', () => {
    render(<ReportsIndex />);

    expect(screen.getByRole('heading', { level: 1, name: 'Reportes' })).toBeInTheDocument();
    expect(screen.getByText(/Quetzaltenango/)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /Listado de buses/ });
    expect(link).toHaveAttribute('href', '/sucursal/reportes/buses');
    expect(link).toHaveTextContent('kilometraje');
    const drivers = screen.getByRole('link', { name: /Listado de choferes/ });
    expect(drivers).toHaveAttribute('href', '/sucursal/reportes/choferes');
    expect(drivers).toHaveTextContent('vencimiento');
    const tickets = screen.getByRole('link', { name: /Ingresos por boletos/ });
    expect(tickets).toHaveAttribute('href', '/sucursal/reportes/ingresos-boletos');
    expect(tickets).toHaveTextContent('ruta');
    const rentals = screen.getByRole('link', { name: /Ingresos por alquiler/ });
    expect(rentals).toHaveAttribute('href', '/sucursal/reportes/ingresos-alquileres');
    expect(rentals).toHaveTextContent('alquileres pagados');
    const depreciation = screen.getByRole('link', { name: /Depreciación por bus/ });
    expect(depreciation).toHaveAttribute('href', '/sucursal/reportes/depreciacion');
    expect(depreciation).toHaveTextContent('depreciación acumulada');
    const repairs = screen.getByRole('link', { name: /Gastos de taller por bus/ });
    expect(repairs).toHaveAttribute('href', '/sucursal/reportes/taller');
    expect(repairs).toHaveTextContent('categoría');
  });
});
