import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useTripsPage } from '../../hooks/use-trips';
import { trip, tripPage } from '../../test-support/trips';
import { OnTheRoad } from './on-the-road';

jest.mock('../../hooks/use-trips');

jest.mock('../../hooks/use-now', () => ({ useNow: () => Date.parse('2026-10-20T13:00:00.000Z') }));

const road = [
  trip({
    id: 'a',
    status: 'IN_TRANSIT',
    destinationName: 'Guatemala',
    busPlate: 'C482BTX',
    departureAt: '2026-10-20T11:30:00.000Z',
    estimatedArrivalAt: '2026-10-20T16:30:00.000Z',
  }),
  trip({
    id: 'b',
    type: 'RENTAL',
    routeId: null,
    status: 'IN_TRANSIT',
    originName: 'Quetzaltenango',
    destinationName: 'Flores',
    busPlate: 'C731PLR',
    departureAt: '2026-10-20T12:00:00.000Z',
    estimatedArrivalAt: '2026-10-20T22:00:00.000Z',
  }),
];

function setup(state: { items?: unknown[]; pending?: boolean; error?: boolean } = {}) {
  const refetch = jest.fn();
  jest.mocked(useTripsPage).mockReturnValue({
    data: state.pending || state.error ? undefined : tripPage((state.items ?? road) as never),
    isPending: Boolean(state.pending),
    isError: Boolean(state.error),
    refetch,
  } as never);
  render(<OnTheRoad />);
  return { refetch };
}

it('asks for the trips that are on the road, whatever their day', () => {
  setup();

  expect(useTripsPage).toHaveBeenCalledWith(
    { status: 'IN_TRANSIT', page: 1, pageSize: 100 },
    expect.anything(),
  );
});

it('asks again every minute, so a bus that just left shows up on its own', () => {
  setup();

  expect(useTripsPage).toHaveBeenCalledWith(expect.anything(), { refetchInterval: 60_000 });
});

it('shows each bus with its route, plate, departure hour and estimated arrival', () => {
  setup();

  const first = screen.getByRole('listitem', { name: /Guatemala/ });
  expect(first).toHaveTextContent('Quetzaltenango');
  expect(first).toHaveTextContent('C-482BTX');
  expect(first).toHaveTextContent('salió 05:30');
  expect(first).toHaveTextContent('10:30');
});

it('marks how far along the road each bus is', () => {
  setup();

  // 13:00 UTC is 1.5 of the 5 hours of the first trip and 1 of the 10 of the second
  expect(screen.getByRole('progressbar', { name: 'Avance de C-482BTX' })).toHaveAttribute(
    'aria-valuenow',
    '30',
  );
  expect(screen.getByRole('progressbar', { name: 'Avance de C-731PLR' })).toHaveAttribute(
    'aria-valuenow',
    '10',
  );
});

it('shows the real departure hour and measures the road from it, not from the schedule', () => {
  setup({
    items: [
      trip({
        id: 'c',
        status: 'IN_TRANSIT',
        destinationName: 'Cobán',
        busPlate: 'C900ABC',
        // Scheduled for 14:00 in Guatemala, but it left at 05:00
        departureAt: '2026-10-20T20:00:00.000Z',
        departedAt: '2026-10-20T11:00:00.000Z',
        estimatedArrivalAt: '2026-10-20T21:00:00.000Z',
      }),
    ],
  });

  expect(screen.getByRole('listitem', { name: /Cobán/ })).toHaveTextContent('salió 05:00');
  // 13:00 UTC is 2 of the 10 hours between the real departure and the estimated arrival
  expect(screen.getByRole('progressbar', { name: 'Avance de C-900ABC' })).toHaveAttribute(
    'aria-valuenow',
    '20',
  );
});

it('calls a rental by its name', () => {
  setup();

  expect(screen.getByRole('listitem', { name: /Flores/ })).toHaveTextContent('Alquiler');
});

it('only animates the road when motion is allowed', () => {
  setup();

  const lines = document.querySelectorAll('line.animate-route-sm');
  expect(lines).toHaveLength(2);
  lines.forEach((line) => expect(line).toHaveClass('motion-reduce:animate-none'));
});

it('promises to show a bus when it leaves, if none is on the road', () => {
  setup({ items: [] });

  expect(screen.getByText('Cuando un bus salga, lo verás aquí.')).toBeInTheDocument();
});

it('shows a loading state while the trips arrive', () => {
  setup({ pending: true });

  expect(screen.getByLabelText('Cargando')).toBeInTheDocument();
});

it('shows a friendly error with a retry', async () => {
  const { refetch } = setup({ error: true });

  expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar los viajes en ruta.');
  await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

  expect(refetch).toHaveBeenCalled();
});
