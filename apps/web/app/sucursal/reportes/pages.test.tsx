import { render, screen } from '@testing-library/react';
import { act } from 'react';
import { clearSession, setSession } from '@/lib/auth/session-store';
import BusesReportPage, { metadata as busesMetadata } from './buses/page';
import DriversReportPage, { metadata as driversMetadata } from './choferes/page';
import DepreciationReportPage, { metadata as depreciationMetadata } from './depreciacion/page';
import TicketIncomeReportPage, { metadata as ticketIncomeMetadata } from './ingresos-boletos/page';
import RentalIncomeReportPage, {
  metadata as rentalIncomeMetadata,
} from './ingresos-alquileres/page';
import ReportsPage, { metadata as indexMetadata } from './page';
import RepairReportPage, { metadata as repairMetadata } from './taller/page';

const replace = jest.fn();
jest.mock('../../../components/branch-reports/buses-report', () => ({
  BusesReport: () => <p>reporte de buses</p>,
}));
jest.mock('../../../components/branch-reports/drivers-report', () => ({
  DriversReport: () => <p>reporte de choferes</p>,
}));
jest.mock('../../../components/branch-reports/depreciation-report', () => ({
  DepreciationReport: () => <p>reporte de depreciación</p>,
}));
jest.mock('../../../components/branch-reports/ticket-income-report', () => ({
  TicketIncomeReport: () => <p>reporte de ingresos por boletos</p>,
}));
jest.mock('../../../components/branch-reports/rental-income-report', () => ({
  RentalIncomeReport: () => <p>reporte de ingresos por alquiler</p>,
}));
jest.mock('../../../components/branch-reports/repair-report', () => ({
  RepairReport: () => <p>reporte de taller</p>,
}));
jest.mock('../../../components/branch-reports/reports-index', () => ({
  ReportsIndex: () => <p>índice de reportes</p>,
}));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/sucursal/reportes',
}));

const signIn = (role: 'BRANCH_ADMIN' | 'CASHIER') =>
  act(() =>
    setSession({
      accessToken: 'a',
      accessExpiresIn: 900,
      user: {
        id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
        fullName: 'Marta Ruiz',
        email: 'm@b.com',
        role,
        branchId: '8f9e6679-7425-40de-944b-e07fc1f90ae7',
      },
    }),
  );
beforeEach(() => replace.mockReset());
afterEach(() => act(() => clearSession()));

describe('report pages', () => {
  it('show the index and each report to the branch admin', () => {
    signIn('BRANCH_ADMIN');
    const index = render(<ReportsPage />);
    expect(screen.getByText('índice de reportes')).toBeInTheDocument();
    index.unmount();
    const buses = render(<BusesReportPage />);
    expect(screen.getByText('reporte de buses')).toBeInTheDocument();
    buses.unmount();
    render(<DriversReportPage />);
    expect(screen.getByText('reporte de choferes')).toBeInTheDocument();
    render(<DepreciationReportPage />);
    expect(screen.getByText('reporte de depreciación')).toBeInTheDocument();
    render(<TicketIncomeReportPage />);
    expect(screen.getByText('reporte de ingresos por boletos')).toBeInTheDocument();
    render(<RentalIncomeReportPage />);
    expect(screen.getByText('reporte de ingresos por alquiler')).toBeInTheDocument();
    render(<RepairReportPage />);

    expect(screen.getByText('reporte de taller')).toBeInTheDocument();
    expect(indexMetadata.title).toBe('Reportes · debus');
    expect(busesMetadata.title).toBe('Listado de buses · debus');
    expect(driversMetadata.title).toBe('Listado de choferes · debus');
    expect(depreciationMetadata.title).toBe('Depreciación por bus · debus');
    expect(ticketIncomeMetadata.title).toBe('Ingresos por boletos · debus');
    expect(rentalIncomeMetadata.title).toBe('Ingresos por alquiler · debus');
    expect(repairMetadata.title).toBe('Gastos de taller por bus · debus');
  });

  it.each([
    ReportsPage,
    BusesReportPage,
    DriversReportPage,
    DepreciationReportPage,
    TicketIncomeReportPage,
    RentalIncomeReportPage,
    RepairReportPage,
  ])('send a cashier back to their own home', (Page) => {
    signIn('CASHIER');
    render(<Page />);

    expect(screen.queryByText(/reporte|índice/)).not.toBeInTheDocument();
    expect(replace).toHaveBeenCalledWith('/sucursal');
  });
});
