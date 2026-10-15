import type { BranchRentalIncomePage, BranchRentalIncomeRow } from '@debus/contracts';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useReport } from '../../hooks/use-report';
import { useReportPdf } from '../../hooks/use-report-pdf';
import { formatDateTime, formatQuetzales, formatShortDate } from '../../lib/format';
import { DEBOUNCE_MS, startFakeClock } from '../../test-support/fake-clock';
import { RentalIncomeReport } from './rental-income-report';

jest.mock('../../hooks/use-report');
jest.mock('../../hooks/use-report-pdf');
jest.mock('../../hooks/use-own-branch', () => ({
  useOwnBranch: () => ({ id: 'br', name: 'Quetzaltenango' }),
}));
const replace = jest.fn();
let search = '';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/sucursal/reportes/ingresos-alquileres',
  useSearchParams: () => new URLSearchParams(search),
}));

// The formats of the browser separate their parts with no-break spaces.
const plain = (text: string) => text.replace(/\s/g, ' ');
const money = (value: number) => plain(formatQuetzales(value));

const user = userEvent.setup({ applyAccept: false });

const row = (over: Partial<BranchRentalIncomeRow> = {}): BranchRentalIncomeRow => ({
  rentalId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  clientName: 'Colegio San José',
  nit: '1234567-8',
  originLabel: 'Quetzaltenango',
  destinationLabel: 'Panajachel',
  departureAt: '2026-10-24T13:00:00.000Z',
  returnAt: '2026-10-24T23:00:00.000Z',
  paidOn: '2026-10-21',
  passengers: 35,
  busPlate: 'C482BTX',
  price: 2760,
  ...over,
});

const oneWay = row({
  rentalId: 'r2',
  clientName: 'Excursión Los Pérez',
  nit: 'CF',
  destinationLabel: 'Semuc Champey',
  returnAt: null,
  busPlate: null,
  price: 1500,
});

const answer = (
  items: BranchRentalIncomeRow[],
  { total = items.length }: { total?: number } = {},
): BranchRentalIncomePage => ({
  items,
  total,
  page: 1,
  pageSize: 20,
  summary: { totals: { rentals: 5, income: 9000.5 }, groups: [] },
});

const exportPdf = jest.fn();
function setup({
  data = answer([row(), oneWay]),
  address = '',
  error = false,
  pending = false,
  placeholder = false,
}: {
  data?: BranchRentalIncomePage;
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
  render(<RentalIncomeReport />);
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

describe('RentalIncomeReport', () => {
  it('names the report and the branch and has a single primary button', () => {
    setup();

    expect(
      screen.getByRole('heading', { level: 1, name: 'Ingresos por alquiler' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/· Quetzaltenango/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exportar PDF' })).toHaveClass('bg-primary');
  });

  it('asks the report for the query of the address', () => {
    setup({ address: 'desde=2026-10-01&hasta=2026-10-13&buscar=colegio&pagina=2' });

    const [path, params] = jest.mocked(useReport).mock.calls.at(-1)!;
    expect(path).toBe('/api/reportes/reports/branch-rental-income');
    expect(params.toString()).toBe('from=2026-10-01&page=2&pageSize=20&q=colegio&to=2026-10-13');
  });

  it('lists the columns of the report with the client and the NIT together', () => {
    setup();

    const table = screen.getByRole('table', { name: 'Ingresos por alquiler' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((c) => c.textContent),
    ).toEqual([
      'Cliente',
      'Origen',
      'Destino',
      'Salida',
      'Regreso',
      'Pagado el',
      'Bus',
      'Pasajeros',
      'Precio',
    ]);
    const first = within(screen.getByRole('row', { name: /San José/ }));
    expect(first.getByText('Colegio San José')).toBeInTheDocument();
    expect(first.getByText('NIT 1234567-8')).toBeInTheDocument();
    expect(first.getByText('Panajachel')).toBeInTheDocument();
    expect(first.getByText(plain(formatDateTime('2026-10-24T13:00:00.000Z')))).toBeInTheDocument();
    expect(first.getByText(plain(formatDateTime('2026-10-24T23:00:00.000Z')))).toBeInTheDocument();
    expect(first.getByText(plain(formatShortDate('2026-10-21', true)))).toBeInTheDocument();
    expect(first.getByText('C-482BTX')).toHaveClass('font-mono');
    expect(first.getByText('35')).toBeInTheDocument();
    expect(first.getByText(money(2760))).toBeInTheDocument();
  });

  it('says one-way for a rental without return and to assign for one without a bus', () => {
    setup();

    const second = within(screen.getByRole('row', { name: /Los Pérez/ }));
    expect(second.getByText('Solo ida')).toBeInTheDocument();
    expect(second.getByText('Por asignar')).toBeInTheDocument();
  });

  it('highlights the rentals and the income of the whole filter', () => {
    setup();

    const highlights = within(screen.getByRole('region', { name: 'Resumen del reporte' }));
    expect(highlights.getByText('Alquileres')).toBeInTheDocument();
    expect(highlights.getByText('5')).toBeInTheDocument();
    expect(highlights.getByText('Ingresos')).toBeInTheDocument();
    expect(highlights.getByText(money(9000.5))).toBeInTheDocument();
  });

  it('starts with every record and writes the applied period in the address', async () => {
    setup({ address: 'pagina=3' });
    expect(screen.getByRole('button', { name: /Periodo/ })).toHaveTextContent(
      'Todos los registros',
    );

    await user.click(screen.getByRole('button', { name: /Periodo/ }));
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-13' } });
    await user.click(screen.getByRole('button', { name: 'Aplicar' }));

    const { path, params } = lastAddress();
    expect(path).toBe('/sucursal/reportes/ingresos-alquileres');
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

  it('searches the client, the NIT and the destination and writes it after the last key', async () => {
    const clock = startFakeClock();
    setup({ address: 'pagina=2' });
    const box = screen.getByRole('textbox', { name: 'Buscar' });
    expect(box).toHaveAttribute('placeholder', 'Cliente, NIT o destino');

    await clock.type(box, 'colegio');
    expect(replace).not.toHaveBeenCalled();
    await clock.elapse(DEBOUNCE_MS);

    const { params } = lastAddress();
    expect(params.get('buscar')).toBe('colegio');
    expect(params.has('pagina')).toBe(false);
  });

  it('clears the period and the search together', async () => {
    setup({ address: 'desde=2026-10-01&buscar=colegio&pagina=2' });

    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }));

    expect(lastAddress().params.toString()).toBe('');
  });

  it('offers no clearing when nothing narrows the report', () => {
    setup();

    expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).not.toBeInTheDocument();
  });

  it('exports with the same filters the table has', async () => {
    setup({ address: 'desde=2026-10-01&buscar=colegio' });

    await user.click(screen.getByRole('button', { name: 'Exportar PDF' }));

    expect(exportPdf).toHaveBeenCalledTimes(1);
    const [path, params, stem] = jest.mocked(useReportPdf).mock.calls.at(-1)!;
    expect(path).toBe('/api/reportes/reports/branch-rental-income');
    expect(params.get('from')).toBe('2026-10-01');
    expect(params.get('q')).toBe('colegio');
    expect(stem).toBe('reporte-ingresos-alquileres');
  });

  it('explains an empty report under filters and a branch without paid rentals', () => {
    setup({ data: answer([], { total: 0 }), address: 'buscar=zzz' });
    expect(screen.getByText('No hay alquileres pagados con esos filtros.')).toBeInTheDocument();
  });

  it('explains a branch without paid rentals', () => {
    setup({ data: answer([], { total: 0 }) });
    expect(screen.getByText('Aún no hay alquileres pagados.')).toBeInTheDocument();
  });

  it('shows the skeleton while it loads', () => {
    setup({ pending: true });

    expect(screen.getAllByLabelText('Cargando').length).toBeGreaterThan(0);
  });

  it('dims the table while the next page arrives', () => {
    setup({ placeholder: true });

    expect(
      screen.getByRole('table', { name: 'Ingresos por alquiler' }).closest('section'),
    ).toHaveAttribute('aria-busy', 'true');
  });

  it('says it could not load the report and tries again on request', async () => {
    const { refetch } = setup({ error: true });

    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar el reporte.');
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(refetch).toHaveBeenCalled();
  });

  it('keeps the search box in step with the address', () => {
    setup({ address: 'buscar=colegio' });

    expect(screen.getByRole('textbox', { name: 'Buscar' })).toHaveValue('colegio');
  });
});
