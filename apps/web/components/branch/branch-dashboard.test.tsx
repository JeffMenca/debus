import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { clearSession, setSession } from '@/lib/auth/session-store';
import { useExpiringDrivers } from '../../hooks/use-drivers';
import { useTripsPage } from '../../hooks/use-trips';
import { driver, driverPage } from '../../test-support/fleet';
import { trip, tripPage } from '../../test-support/trips';
import { BranchDashboard } from './branch-dashboard';

jest.mock('../../hooks/use-trips');
jest.mock('../../hooks/use-drivers');
jest.mock('../trips/schedule-trip-dialog', () => ({
  ScheduleTripDialog: ({ open, defaultDay }: { open: boolean; defaultDay: string }) =>
    open ? <div role="dialog" aria-label="Programar viaje" data-day={defaultDay} /> : null,
}));
jest.mock('./on-the-road', () => ({ OnTheRoad: () => <section>en ruta</section> }));
jest.mock('./upcoming-departures', () => ({
  ...jest.requireActual('./upcoming-departures'),
  UpcomingDepartures: ({ day }: { day: string }) => (
    <section data-day={day}>próximas salidas</section>
  ),
}));
jest.mock('./expiring-licenses', () => ({
  ExpiringLicenses: () => <section>licencias</section>,
}));

// 06:00 in Guatemala on Monday the 12th
const MORNING = new Date('2026-10-12T12:00:00.000Z');
const TODAY = '2026-10-12';

function setup({
  departures = 14,
  licences = 3,
  pending = false,
}: { departures?: number; licences?: number; pending?: boolean } = {}) {
  jest.mocked(useTripsPage).mockReturnValue({
    data: pending ? undefined : tripPage([trip()], { total: departures }),
    isPending: pending,
    isError: false,
  } as never);
  jest.mocked(useExpiringDrivers).mockReturnValue({
    data: pending ? undefined : driverPage([driver()], { total: licences }),
    isPending: pending,
    isError: false,
  } as never);
  render(<BranchDashboard />);
}

beforeEach(() => {
  // Only the clock is faked: the count-up animation and the timers of Testing Library keep running.
  jest.useFakeTimers({
    now: MORNING,
    doNotFake: [
      'hrtime',
      'nextTick',
      'performance',
      'queueMicrotask',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'requestIdleCallback',
      'cancelIdleCallback',
      'setImmediate',
      'clearImmediate',
      'setInterval',
      'clearInterval',
      'setTimeout',
      'clearTimeout',
    ],
  });
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)',
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  act(() =>
    setSession({
      accessToken: 'a',
      accessExpiresIn: 900,
      user: {
        id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
        fullName: 'Marta Ruiz Pérez',
        email: 'm@b.com',
        role: 'BRANCH_ADMIN',
        branchId: '8f9e6679-7425-40de-944b-e07fc1f90ae7',
      },
    }),
  );
});
afterEach(() => {
  jest.useRealTimers();
  act(() => clearSession());
});

describe('BranchDashboard', () => {
  it('greets by the hour of Guatemala with the first name and the long date', () => {
    setup();

    expect(
      screen.getByRole('heading', { level: 1, name: 'Buenos días, Marta' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Lunes 12 de octubre')).toBeInTheDocument();
  });

  it('starts the day field on today and asks for the departures of that day', () => {
    setup();

    expect(screen.getByLabelText('Día')).toHaveValue(TODAY);
    expect(useTripsPage).toHaveBeenCalledWith({
      from: TODAY,
      to: TODAY,
      status: 'SCHEDULED',
      page: 1,
      pageSize: 5,
    });
    expect(screen.getByText('próximas salidas')).toHaveAttribute('data-day', TODAY);
  });

  it('counts the scheduled departures and the licences about to expire', async () => {
    setup({ departures: 14, licences: 3 });

    const departures = await screen.findByText('Salidas programadas hoy');
    expect(departures.parentElement).toHaveTextContent('14');
    expect(screen.getByText('Licencias por vencer').parentElement).toHaveTextContent('3');
    expect(useExpiringDrivers).toHaveBeenCalledWith(30);
  });

  it('shows the other blocks of the panel', () => {
    setup();

    expect(screen.getByText('en ruta')).toBeInTheDocument();
    expect(screen.getByText('licencias')).toBeInTheDocument();
  });

  it('changes the departures, the date and the card label when another day is picked', () => {
    setup();

    fireEvent.change(screen.getByLabelText('Día'), { target: { value: '2026-10-14' } });

    expect(useTripsPage).toHaveBeenLastCalledWith({
      from: '2026-10-14',
      to: '2026-10-14',
      status: 'SCHEDULED',
      page: 1,
      pageSize: 5,
    });
    expect(screen.getByText('Miércoles 14 de octubre')).toBeInTheDocument();
    expect(screen.getByText('próximas salidas')).toHaveAttribute('data-day', '2026-10-14');
    expect(screen.getByText('Salidas programadas ese día')).toBeInTheDocument();
  });

  it('goes back to today when the day is cleared', () => {
    setup();

    fireEvent.change(screen.getByLabelText('Día'), { target: { value: '' } });

    expect(screen.getByLabelText('Día')).toHaveValue(TODAY);
  });

  it('has a single primary action that opens the dialog on the day shown', async () => {
    setup();
    fireEvent.change(screen.getByLabelText('Día'), { target: { value: '2026-10-14' } });

    await userEvent.click(screen.getByRole('button', { name: 'Programar viaje' }));

    expect(screen.getByRole('dialog', { name: 'Programar viaje' })).toHaveAttribute(
      'data-day',
      '2026-10-14',
    );
  });

  it('opens the dialog on today when the day shown has already passed', async () => {
    setup();
    fireEvent.change(screen.getByLabelText('Día'), { target: { value: '2026-10-05' } });

    await userEvent.click(screen.getByRole('button', { name: 'Programar viaje' }));

    expect(screen.getByRole('dialog', { name: 'Programar viaje' })).toHaveAttribute(
      'data-day',
      TODAY,
    );
  });

  it('shows placeholders while the counts load', () => {
    setup({ pending: true });

    expect(screen.getAllByLabelText('Cargando')).toHaveLength(2);
  });

  it('shows a dash instead of a count that could not load', () => {
    jest
      .mocked(useTripsPage)
      .mockReturnValue({ data: undefined, isPending: false, isError: true } as never);
    jest.mocked(useExpiringDrivers).mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
    } as never);
    render(<BranchDashboard />);

    expect(screen.getByText('Salidas programadas hoy').parentElement).toHaveTextContent('—');
    expect(screen.getByText('Licencias por vencer').parentElement).toHaveTextContent('—');
  });
});
