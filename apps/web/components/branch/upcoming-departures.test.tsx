import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useTripsPage } from '../../hooks/use-trips';
import { trip, tripPage } from '../../test-support/trips';
import { UpcomingDepartures } from './upcoming-departures';

jest.mock('../../hooks/use-trips');

const DAY = '2026-10-20';
const departures = [
  trip({ id: 'a' }),
  trip({
    id: 'b',
    destinationName: 'Flores',
    busPlate: 'C731PLR',
    driverName: 'Ana Sic',
    departureAt: '2026-10-20T19:00:00.000Z',
  }),
];

function setup(state: { items?: unknown[]; pending?: boolean; error?: boolean } = {}) {
  const refetch = jest.fn();
  jest.mocked(useTripsPage).mockReturnValue({
    data: state.pending || state.error ? undefined : tripPage((state.items ?? departures) as never),
    isPending: Boolean(state.pending),
    isError: Boolean(state.error),
    refetch,
  } as never);
  render(<UpcomingDepartures day={DAY} />);
  return { refetch };
}

it('asks for the first five scheduled departures of the day', () => {
  setup();

  expect(useTripsPage).toHaveBeenCalledWith({
    from: DAY,
    to: DAY,
    status: 'SCHEDULED',
    page: 1,
    pageSize: 5,
  });
});

it('lists the hour of Guatemala, route, bus and driver of each departure', () => {
  setup();

  const first = screen.getByRole('row', { name: /Guatemala/ });
  expect(first).toHaveTextContent('05:30');
  expect(first).toHaveTextContent('Quetzaltenango');
  expect(first).toHaveTextContent('C-482BTX');
  expect(first).toHaveTextContent('Julio Pérez');
  expect(screen.getByRole('row', { name: /Flores/ })).toHaveTextContent('13:00');
});

it('links to the trips of that day', () => {
  setup();

  expect(screen.getByRole('link', { name: 'Ver todos los viajes' })).toHaveAttribute(
    'href',
    `/sucursal/viajes?desde=${DAY}&hasta=${DAY}`,
  );
});

it('says so when nothing leaves that day', () => {
  setup({ items: [] });

  expect(screen.getByText('No hay salidas programadas para este día.')).toBeInTheDocument();
});

it('shows a loading state while the trips arrive', () => {
  setup({ pending: true });

  expect(screen.getByLabelText('Cargando')).toBeInTheDocument();
});

it('shows a friendly error with a retry', async () => {
  const { refetch } = setup({ error: true });

  expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar las salidas.');
  await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

  expect(refetch).toHaveBeenCalled();
});
