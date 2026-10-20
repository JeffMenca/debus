import { render, screen, within } from '@testing-library/react';
import { ServiceHealthCard } from './service-health-card';

const units = [
  { unit: 'gateway' as const, status: 'up' as const, latencyMs: 0 },
  {
    unit: 'ventas' as const,
    status: 'up' as const,
    latencyMs: 12,
    circuits: [
      {
        target: 'clientes' as const,
        state: 'open' as const,
        failures: 5,
        retryAt: '2026-10-19T16:32:05.000Z',
      },
      { target: 'viajes' as const, state: 'closed' as const, failures: 0, retryAt: null },
    ],
  },
  { unit: 'flota' as const, status: 'down' as const, latencyMs: 10000, circuits: [] },
];

describe('ServiceHealthCard', () => {
  it('shows each unit with its status', () => {
    render(<ServiceHealthCard units={units} />);

    expect(screen.getByText('Entrada principal')).toBeInTheDocument();
    expect(screen.getAllByText('En línea')).toHaveLength(2);
    expect(screen.getByText('Sin respuesta')).toBeInTheDocument();
  });

  it('shows below a unit the state of each connection it has with another service', () => {
    render(<ServiceHealthCard units={units} />);

    const ventas = screen.getByText('Ventas').closest('li')!;
    expect(within(ventas).getByText('Conexión con Clientes')).toBeInTheDocument();
    expect(within(ventas).getByText('En pausa hasta 10:32:05')).toBeInTheDocument();
    expect(within(ventas).getByText('Conexión con Viajes')).toBeInTheDocument();
    expect(within(ventas).getByText('Normal')).toBeInTheDocument();
  });

  it('adds no lines to a unit without connections', () => {
    render(<ServiceHealthCard units={units} />);

    expect(within(screen.getByText('Flota').closest('li')!).queryByText(/Conexión con/)).toBeNull();
    expect(
      within(screen.getByText('Entrada principal').closest('li')!).queryByText(/Conexión con/),
    ).toBeNull();
    expect(screen.getAllByText(/Conexión con/)).toHaveLength(2);
  });
});
