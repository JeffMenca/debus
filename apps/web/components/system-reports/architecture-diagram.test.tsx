import {
  ARCHITECTURE_UNITS,
  type UnitHealth,
  eventFlows,
  filterFlows,
  syncCallsFor,
} from '@debus/contracts';
import { fireEvent, render, screen } from '@testing-library/react';
import { ArchitectureDiagram, insideBox, segment } from './architecture-diagram';

const flows = eventFlows();
const health: UnitHealth[] = [
  {
    unit: 'ventas',
    status: 'up',
    latencyMs: 12,
    circuits: [{ target: 'clientes', state: 'open', retryAt: null }],
  },
  { unit: 'flota', status: 'down', latencyMs: 3000 },
] as UnitHealth[];

function renderDiagram(props: Partial<Parameters<typeof ArchitectureDiagram>[0]> = {}) {
  const onSelectService = jest.fn();
  render(
    <ArchitectureDiagram
      flows={flows}
      syncCalls={syncCallsFor()}
      health={health}
      onSelectService={onSelectService}
      {...props}
    />,
  );
  return { onSelectService };
}

describe('ArchitectureDiagram', () => {
  it('draws the gateway, the seven services and Pub/Sub, each service with its live state', () => {
    renderDiagram();

    expect(screen.getByRole('group', { name: /Arquitectura de debus/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ventas: en línea' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Flota: sin respuesta' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reportes: sin datos' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Entrada principal/ })).toBeInTheDocument();
    expect(screen.getByText('Pub/Sub')).toBeInTheDocument();
    expect(screen.getByText('26 eventos + prueba')).toBeInTheDocument();
    expect(screen.getAllByText('en línea').length).toBeGreaterThan(0);
  });

  it('shows the direct calls with the state of their connection', () => {
    renderDiagram();

    expect(screen.getByText('Cobrar con la cartera · en pausa')).toBeInTheDocument();
    expect(screen.getByText('¿Bus y chofer libres?')).toBeInTheDocument();
  });

  it('names the selected event and its topic in the middle', () => {
    renderDiagram({ flows: filterFlows(flows, { event: 'TripDeleted' }), event: 'TripDeleted' });

    expect(screen.getByText('TripDeleted')).toBeInTheDocument();
    expect(screen.getByText('viajes-events')).toBeInTheDocument();
  });

  it('selects a service when its box is pressed or chosen with the keyboard', () => {
    const { onSelectService } = renderDiagram();

    fireEvent.click(screen.getByRole('button', { name: 'Ventas: en línea' }));
    fireEvent.keyDown(screen.getByRole('button', { name: 'Flota: sin respuesta' }), {
      key: 'Enter',
    });

    expect(onSelectService).toHaveBeenNthCalledWith(1, 'ventas');
    expect(onSelectService).toHaveBeenNthCalledWith(2, 'flota');
  });

  it('lets go of the selected service when it is pressed again', () => {
    const { onSelectService } = renderDiagram({ service: 'ventas' });

    fireEvent.click(screen.getByRole('button', { name: 'Ventas: en línea' }));

    expect(onSelectService).toHaveBeenCalledWith(undefined);
  });
});

describe('segment', () => {
  it('ends every event line outside the hub and the box it points at, so its arrow shows', () => {
    for (const unit of ARCHITECTURE_UNITS) {
      for (const lane of [-5, 5]) {
        const { hub, node } = segment(unit, lane);
        expect(insideBox(hub, 'hub')).toBe(false);
        expect(insideBox(node, unit)).toBe(false);
      }
    }
  });

  it('counts only the business events when the probe is filtered out', () => {
    render(
      <ArchitectureDiagram
        flows={filterFlows(flows, { service: 'clientes' })}
        syncCalls={[]}
        health={undefined}
        onSelectService={jest.fn()}
      />,
    );

    expect(screen.getByText(/^\d+ eventos \+ prueba$/)).toBeInTheDocument();
  });
});
