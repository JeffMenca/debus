import { render, screen } from '@testing-library/react';
import { act } from 'react';
import { clearSession, setSession } from '@/lib/auth/session-store';
import BusesReportPage, { metadata as busesMetadata } from './buses/page';
import ReportsPage, { metadata as indexMetadata } from './page';

const replace = jest.fn();
jest.mock('../../../components/branch-reports/buses-report', () => ({
  BusesReport: () => <p>reporte de buses</p>,
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
  it('show the index and the buses report to the branch admin', () => {
    signIn('BRANCH_ADMIN');
    const index = render(<ReportsPage />);
    expect(screen.getByText('índice de reportes')).toBeInTheDocument();
    index.unmount();
    render(<BusesReportPage />);

    expect(screen.getByText('reporte de buses')).toBeInTheDocument();
    expect(indexMetadata.title).toBe('Reportes · debus');
    expect(busesMetadata.title).toBe('Listado de buses · debus');
  });

  it.each([ReportsPage, BusesReportPage])('send a cashier back to their own home', (Page) => {
    signIn('CASHIER');
    render(<Page />);

    expect(screen.queryByText(/reporte|índice/)).not.toBeInTheDocument();
    expect(replace).toHaveBeenCalledWith('/sucursal');
  });
});
