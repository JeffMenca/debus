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
  });
});
