import type { ArchitecturePage } from '@debus/contracts';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useReport } from '../../hooks/use-report';
import { useReportPdf } from '../../hooks/use-report-pdf';
import { reportState } from '../../test-support/system-reports';
import { ArchitectureReport } from './architecture-report';

jest.mock('../../hooks/use-report');
jest.mock('../../hooks/use-report-pdf');
const replace = jest.fn();
let search = '';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/admin/reportes/arquitectura',
  useSearchParams: () => new URLSearchParams(search),
}));
jest.mock('../../hooks/use-system-status', () => ({
  useSystemStatus: () => ({
    data: { units: [{ unit: 'ventas', status: 'up', latencyMs: 9 }] },
  }),
}));

const user = userEvent.setup({ applyAccept: false });
const exportPdf = jest.fn();

const page: ArchitecturePage = {
  items: [
    {
      type: 'TicketSold',
      publisher: 'ventas',
      topic: 'ventas-events',
      consumers: [
        { service: 'reportes', subscription: 'reportes-from-ventas' },
        { service: 'notificaciones', subscription: 'notificaciones-from-ventas' },
      ],
      diagnostic: false,
      effect: 'Reportes suma el ingreso.',
    },
    {
      type: 'ProbeSent',
      publisher: 'gateway',
      topic: 'gateway-events',
      consumers: [{ service: 'flota', subscription: 'flota-from-gateway' }],
      diagnostic: true,
      effect: 'Aviso de prueba.',
    },
  ],
  total: 27,
  page: 1,
  pageSize: 20,
  summary: { totals: { events: 27, subscriptions: 60 }, groups: [] },
};

function setup(state: Parameters<typeof reportState>[0] = { data: page }) {
  jest.mocked(useReport).mockReturnValue(reportState(state) as never);
  jest.mocked(useReportPdf).mockReturnValue({ exportPdf, exporting: false });
  render(<ArchitectureReport />);
}

beforeEach(() => {
  replace.mockReset();
  exportPdf.mockReset();
  search = '';
});

describe('ArchitectureReport', () => {
  it('shows the totals, the live diagram and the page of events with their subscriptions', () => {
    setup();

    expect(screen.getByRole('heading', { name: 'Arquitectura' })).toBeInTheDocument();
    const summary = screen.getByRole('region', { name: 'Resumen del reporte' });
    expect(within(summary).getByText('Eventos de negocio')).toBeInTheDocument();
    expect(within(summary).getByText('Llamadas directas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ventas: en línea' })).toBeInTheDocument();

    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(within(table).getByText('reportes-from-ventas')).toBeInTheDocument();
    expect(within(table).getByText('Reportes suma el ingreso.')).toBeInTheDocument();
    expect(within(table).getByText('Diagnóstico')).toBeInTheDocument();
  });

  it('asks the server for the filters and the page in the address', () => {
    search = 'servicio=clientes&evento=RentalPaid&pagina=2';
    setup();

    const [path, params] = jest.mocked(useReport).mock.calls.at(-1)!;
    expect(path).toBe('/api/reportes/reports/system-architecture');
    expect(params.toString()).toBe('event=RentalPaid&page=2&pageSize=20&service=clientes');
  });

  it('names the selected event and its topic in the diagram', () => {
    search = 'evento=TripDeleted';
    setup();

    expect(screen.getByText('viajes-events', { selector: 'text' })).toBeInTheDocument();
  });

  it('saves the service picked in the diagram in the address', () => {
    setup();

    fireEvent.click(screen.getByRole('button', { name: 'Ventas: en línea' }));

    expect(replace).toHaveBeenCalledWith('/admin/reportes/arquitectura?servicio=ventas', {
      scroll: false,
    });
  });

  it('exports every filtered event, not the page', async () => {
    search = 'servicio=ventas&pagina=2';
    setup();

    await user.click(screen.getByRole('button', { name: 'Exportar PDF' }));

    const [path, params, stem] = jest.mocked(useReportPdf).mock.calls.at(-1)!;
    expect(path).toBe('/api/reportes/reports/system-architecture');
    expect(params.toString()).toBe('service=ventas');
    expect(stem).toBe('reporte-arquitectura');
    expect(exportPdf).toHaveBeenCalled();
  });

  it('offers a retry when the events cannot be loaded', async () => {
    const refetch = jest.fn();
    setup({ error: true, refetch });

    expect(screen.getByText('No pudimos cargar el reporte.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Reintentar|Intentar de nuevo/ }));
    expect(refetch).toHaveBeenCalled();
  });

  it('filters by the service and the event chosen in the selects, from the first page', async () => {
    search = 'pagina=2';
    setup();

    await user.click(screen.getByRole('combobox', { name: 'Servicio' }));
    await user.click(await screen.findByRole('option', { name: 'Flota' }));
    expect(replace).toHaveBeenLastCalledWith('/admin/reportes/arquitectura?servicio=flota', {
      scroll: false,
    });

    await user.click(screen.getByRole('combobox', { name: 'Evento' }));
    await user.click(await screen.findByRole('option', { name: 'TicketSold' }));
    expect(replace).toHaveBeenLastCalledWith('/admin/reportes/arquitectura?evento=TicketSold', {
      scroll: false,
    });
  });

  it('clears both filters', async () => {
    search = 'servicio=ventas&evento=TicketSold';
    setup();

    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }));

    expect(replace).toHaveBeenCalledWith('/admin/reportes/arquitectura', { scroll: false });
  });
});
