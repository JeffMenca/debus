import type { BranchDepreciationPage, BranchDepreciationRow } from '@debus/contracts';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { formatQuetzales } from '../../lib/format';
import { useReport } from '../../hooks/use-report';
import { useReportPdf } from '../../hooks/use-report-pdf';
import { DEBOUNCE_MS, startFakeClock } from '../../test-support/fake-clock';
import { DepreciationReport } from './depreciation-report';

jest.mock('../../hooks/use-report');
jest.mock('../../hooks/use-report-pdf');
jest.mock('../../hooks/use-own-branch', () => ({
  useOwnBranch: () => ({ id: 'br', name: 'Quetzaltenango' }),
}));
const replace = jest.fn();
let search = '';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/sucursal/reportes/depreciacion',
  useSearchParams: () => new URLSearchParams(search),
}));

// The currency format of the browser separates the symbol with a no-break space.
const money = (value: number) => formatQuetzales(value).replace(/\s/g, ' ');

const user = userEvent.setup({ applyAccept: false });

const row = (over: Partial<BranchDepreciationRow> = {}): BranchDepreciationRow => ({
  busId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  plate: 'C482BTX',
  brand: 'Volvo',
  model: 'B8R',
  completedTrips: 2,
  kmTraveled: 300,
  appliedPerKm: 1.33,
  accumulated: 400,
  ...over,
});

const answer = (
  items: BranchDepreciationRow[],
  {
    total = items.length,
    currentPerKm = 1.5,
  }: { total?: number; currentPerKm?: number | null } = {},
): BranchDepreciationPage => ({
  items,
  total,
  page: 1,
  pageSize: 20,
  summary: { totals: { kmTraveled: 1200, accumulated: 1800.5, currentPerKm }, groups: [] },
});

const exportPdf = jest.fn();
function setup({
  data = answer([
    row(),
    row({
      busId: 'b2',
      plate: 'P222BBB',
      brand: 'Hino',
      model: 'RK8',
      completedTrips: 0,
      kmTraveled: 0,
      appliedPerKm: null,
      accumulated: 0,
    }),
  ]),
  address = '',
  error = false,
  pending = false,
  placeholder = false,
}: {
  data?: BranchDepreciationPage;
  address?: string;
  error?: boolean;
  pending?: boolean;
  placeholder?: boolean;
} = {}) {
  search = address;
  const refetch = jest.fn();
  jest.mocked(useReport).mockReturnValue({
    data: error || pending ? undefined : data,
    isPending: pending,
    isError: error,
    isPlaceholderData: placeholder,
    refetch,
  } as never);
  jest.mocked(useReportPdf).mockReturnValue({ exportPdf, exporting: false });
  render(<DepreciationReport />);
  return { refetch };
}

const lastAddress = () => {
  const [url] = replace.mock.calls.at(-1) as [string];
  const [path, query = ''] = url.split('?');
  return { path, params: new URLSearchParams(query) };
};

beforeEach(() => {
  replace.mockReset();
  exportPdf.mockReset();
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)',
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
});
afterEach(() => jest.useRealTimers());

describe('DepreciationReport', () => {
  it('names the report and the branch and has a single primary button', () => {
    setup();

    expect(
      screen.getByRole('heading', { level: 1, name: 'Depreciación por bus' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Quetzaltenango/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exportar PDF' })).toHaveClass('bg-primary');
  });

  it('asks the report for the query of the address', () => {
    setup({ address: 'desde=2026-10-01&hasta=2026-10-13&buscar=volvo&pagina=2' });

    const [path, params] = jest.mocked(useReport).mock.calls.at(-1)!;
    expect(path).toBe('/api/reportes/reports/branch-depreciation');
    expect(params.toString()).toBe('from=2026-10-01&page=2&pageSize=20&q=volvo&to=2026-10-13');
  });

  it('lists the columns of the report and dashes the applied amount of a bus that did not travel', () => {
    setup();

    const table = screen.getByRole('table', { name: 'Depreciación por bus' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((c) => c.textContent),
    ).toEqual([
      'Placa',
      'Bus',
      'Viajes',
      'Km recorridos',
      'Monto por km aplicado',
      'Depreciación acumulada',
    ]);
    const first = within(screen.getByRole('row', { name: /C-482BTX/ }));
    expect(first.getByText('C-482BTX')).toHaveClass('font-mono');
    expect(first.getByText('Volvo B8R')).toBeInTheDocument();
    expect(first.getByText('300 km')).toBeInTheDocument();
    expect(first.getByText(money(1.33))).toBeInTheDocument();
    expect(first.getByText(money(400))).toBeInTheDocument();
    const second = within(screen.getByRole('row', { name: /P-222BBB/ }));
    expect(second.getByText('—')).toBeInTheDocument();
  });

  it('highlights the km, the depreciation of the whole filter and the rate in force today', () => {
    setup();

    const highlights = within(screen.getByRole('region', { name: 'Resumen del reporte' }));
    expect(highlights.getByText('Km recorridos')).toBeInTheDocument();
    expect(highlights.getByText('1,200 km')).toBeInTheDocument();
    expect(highlights.getByText('Depreciación acumulada')).toBeInTheDocument();
    expect(highlights.getByText(money(1800.5))).toBeInTheDocument();
    expect(highlights.getByText('Monto por km vigente hoy')).toBeInTheDocument();
    expect(highlights.getByText(money(1.5))).toBeInTheDocument();
  });

  it('says the rate is not configured when there is none', () => {
    setup({ data: answer([row()], { currentPerKm: null }) });

    expect(
      within(screen.getByRole('region', { name: 'Resumen del reporte' })).getByText(
        'Sin configurar',
      ),
    ).toBeInTheDocument();
  });

  it('explains how the depreciation of each trip is fixed under the table', () => {
    setup();

    expect(
      screen.getByText(
        'La depreciación de cada viaje se fija con el monto vigente el día de su llegada; cambiar el monto no altera viajes anteriores.',
      ),
    ).toBeInTheDocument();
  });

  it('starts with every record in the period and writes the applied one in the address', async () => {
    setup({ address: 'pagina=3' });
    expect(screen.getByRole('button', { name: /Periodo/ })).toHaveTextContent(
      'Todos los registros',
    );

    await user.click(screen.getByRole('button', { name: /Periodo/ }));
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-13' } });
    await user.click(screen.getByRole('button', { name: 'Aplicar' }));

    const { path, params } = lastAddress();
    expect(path).toBe('/sucursal/reportes/depreciacion');
    expect(params.get('desde')).toBe('2026-10-01');
    expect(params.get('hasta')).toBe('2026-10-13');
    expect(params.has('pagina')).toBe(false);
  });

  it('clears the period from the picker', async () => {
    setup({ address: 'desde=2026-10-01&hasta=2026-10-13&pagina=2' });

    await user.click(screen.getByRole('button', { name: /Periodo/ }));
    await user.click(screen.getByRole('button', { name: 'Ver todos los registros' }));

    expect(lastAddress().params.toString()).toBe('');
  });

  it('writes the search in the address after the last key', async () => {
    const clock = startFakeClock();
    setup();

    await clock.type(screen.getByRole('textbox', { name: 'Buscar' }), 'volvo');
    expect(replace).not.toHaveBeenCalled();
    await clock.elapse(DEBOUNCE_MS);

    expect(lastAddress().params.get('buscar')).toBe('volvo');
  });

  it('clears the period and the search together', async () => {
    setup({ address: 'desde=2026-10-01&buscar=volvo&pagina=2' });

    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }));

    expect(lastAddress().params.toString()).toBe('');
  });

  it('offers no clearing when nothing narrows the list', () => {
    setup();

    expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).not.toBeInTheDocument();
  });

  it('exports with the same search the table has', async () => {
    setup({ address: 'desde=2026-10-01' });

    await user.click(screen.getByRole('button', { name: 'Exportar PDF' }));

    expect(exportPdf).toHaveBeenCalledTimes(1);
    const [path, params, stem] = jest.mocked(useReportPdf).mock.calls.at(-1)!;
    expect(path).toBe('/api/reportes/reports/branch-depreciation');
    expect(params.get('from')).toBe('2026-10-01');
    expect(stem).toBe('reporte-depreciacion');
  });

  it('explains an empty list, with and without filters', () => {
    setup({ data: answer([], { total: 0 }), address: 'buscar=zzz' });
    expect(screen.getByText('No hay buses con esos filtros.')).toBeInTheDocument();
  });

  it('explains a branch without buses', () => {
    setup({ data: answer([], { total: 0 }) });
    expect(screen.getByText('Aún no hay buses registrados en tu sucursal.')).toBeInTheDocument();
  });

  it('shows the skeleton while it loads', () => {
    setup({ pending: true });

    expect(screen.getAllByLabelText('Cargando').length).toBeGreaterThan(0);
  });

  it('dims the table while the next page arrives', () => {
    setup({ placeholder: true });

    expect(
      screen.getByRole('table', { name: 'Depreciación por bus' }).closest('section'),
    ).toHaveAttribute('aria-busy', 'true');
  });

  it('says it could not load the report and tries again on request', async () => {
    const { refetch } = setup({ error: true });

    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar el reporte.');
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(refetch).toHaveBeenCalled();
  });

  it('keeps the search box in step with the address', () => {
    setup({ address: 'buscar=volvo' });

    expect(screen.getByRole('textbox', { name: 'Buscar' })).toHaveValue('volvo');
    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar' }), {
      target: { value: 'hino' },
    });
    expect(screen.getByRole('textbox', { name: 'Buscar' })).toHaveValue('hino');
  });
});
