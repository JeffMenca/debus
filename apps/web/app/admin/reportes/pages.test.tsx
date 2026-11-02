import { render, screen } from '@testing-library/react';
import { act } from 'react';
import { clearSession, setSession } from '@/lib/auth/session-store';
import IncomeReportPage, { metadata as IncomeReportMetadata } from './ingresos/page';
import ExpensesReportPage, { metadata as ExpensesReportMetadata } from './gastos/page';
import ProfitReportPage, { metadata as ProfitReportMetadata } from './ganancias/page';
import TopRoutesReportPage, { metadata as TopRoutesReportMetadata } from './rutas-demandadas/page';
import RepairCategoryReportPage, { metadata as RepairCategoryReportMetadata } from './taller/page';
import RoutesMapReportPage, { metadata as RoutesMapReportMetadata } from './mapa-rutas/page';
import ArchitectureReportPage, {
  metadata as ArchitectureReportMetadata,
} from './arquitectura/page';

const replace = jest.fn();
jest.mock('../../../components/system-reports/income-report', () => ({
  IncomeReport: () => <p>reporte ingresos</p>,
}));
jest.mock('../../../components/system-reports/expenses-report', () => ({
  ExpensesReport: () => <p>reporte gastos</p>,
}));
jest.mock('../../../components/system-reports/profit-report', () => ({
  ProfitReport: () => <p>reporte ganancias</p>,
}));
jest.mock('../../../components/system-reports/top-routes-report', () => ({
  TopRoutesReport: () => <p>reporte rutas-demandadas</p>,
}));
jest.mock('../../../components/system-reports/repair-category-report', () => ({
  RepairCategoryReport: () => <p>reporte taller</p>,
}));
jest.mock('../../../components/system-reports/routes-map-report', () => ({
  RoutesMapReport: () => <p>reporte mapa-rutas</p>,
}));
jest.mock('../../../components/system-reports/architecture-report', () => ({
  ArchitectureReport: () => <p>reporte arquitectura</p>,
}));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/admin/reportes/ingresos',
}));

const signIn = (role: 'SYSTEM_ADMIN' | 'BRANCH_ADMIN' | 'CASHIER') =>
  act(() =>
    setSession({
      accessToken: 'a',
      accessExpiresIn: 900,
      user: {
        id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
        fullName: 'Sofía García',
        email: 's@b.com',
        role,
        branchId: role === 'SYSTEM_ADMIN' ? null : '8f9e6679-7425-40de-944b-e07fc1f90ae7',
      },
    }),
  );
beforeEach(() => replace.mockReset());
afterEach(() => act(() => clearSession()));

const PAGES = [
  [IncomeReportPage, IncomeReportMetadata, 'ingresos', 'Ingresos por sucursal'],
  [ExpensesReportPage, ExpensesReportMetadata, 'gastos', 'Gastos por sucursal'],
  [ProfitReportPage, ProfitReportMetadata, 'ganancias', 'Ganancias'],
  [TopRoutesReportPage, TopRoutesReportMetadata, 'rutas-demandadas', 'Rutas más demandadas'],
  [
    RepairCategoryReportPage,
    RepairCategoryReportMetadata,
    'taller',
    'Gastos de taller por categoría',
  ],
  [RoutesMapReportPage, RoutesMapReportMetadata, 'mapa-rutas', 'Mapa de rutas'],
  [ArchitectureReportPage, ArchitectureReportMetadata, 'arquitectura', 'Arquitectura'],
] as const;

describe('system report pages', () => {
  it.each(PAGES)(
    'show %#: the report to the system admin, titled in the browser',
    (Page, metadata, slug, title) => {
      signIn('SYSTEM_ADMIN');
      render(<Page />);

      expect(screen.getByText(`reporte ${slug}`)).toBeInTheDocument();
      expect(metadata.title).toBe(`${title} · debus`);
    },
  );

  it.each(PAGES)('send a branch admin back to their own home from %#', (Page) => {
    signIn('BRANCH_ADMIN');
    render(<Page />);

    expect(screen.queryByText(/reporte /)).not.toBeInTheDocument();
    expect(replace).toHaveBeenCalledWith('/sucursal');
  });

  it.each(PAGES)('send a cashier back to their own home from %#', (Page) => {
    signIn('CASHIER');
    render(<Page />);

    expect(screen.queryByText(/reporte /)).not.toBeInTheDocument();
    expect(replace).toHaveBeenCalledWith('/sucursal');
  });
});
