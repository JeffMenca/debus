import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/api/api-error';
import { useDeleteTrip, useRecordArrival, useRecordDeparture, useTrip } from '../../hooks/use-trip';
import { departureRecord, tripDetail } from '../../test-support/trips';
import { TripDetailScreen } from './trip-detail-screen';

jest.mock('../../hooks/use-trip');
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));

function setup(
  state: { data?: ReturnType<typeof tripDetail>; pending?: boolean; error?: Error } = {},
  audience: 'branch' | 'driver' = 'branch',
) {
  const refetch = jest.fn();
  jest.mocked(useTrip).mockReturnValue({
    data: state.data,
    isPending: Boolean(state.pending),
    isError: Boolean(state.error),
    error: state.error ?? null,
    refetch,
  } as never);
  jest.mocked(useRecordDeparture).mockReturnValue({ mutateAsync: jest.fn() } as never);
  jest.mocked(useRecordArrival).mockReturnValue({ mutateAsync: jest.fn() } as never);
  jest.mocked(useDeleteTrip).mockReturnValue({ mutateAsync: jest.fn() } as never);
  render(<TripDetailScreen tripId="t1" audience={audience} />);
  return { refetch };
}

it('asks for the trip it was given', () => {
  setup({ data: tripDetail() });

  expect(useTrip).toHaveBeenCalledWith('t1');
});

it('shows the trip with its departure, arrival and delete cards to the branch admin', () => {
  setup({ data: tripDetail() });

  expect(
    screen.getByRole('heading', { level: 1, name: 'Quetzaltenango a Guatemala' }),
  ).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Salida' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Llegada' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Eliminar viaje' })).toBeInTheDocument();
});

it('leaves out the delete card for the driver', () => {
  setup({ data: tripDetail() }, 'driver');

  expect(screen.queryByRole('heading', { name: 'Eliminar viaje' })).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Salida' })).toBeInTheDocument();
});

it('has one primary action at a time: the departure first, then the arrival', () => {
  setup({ data: tripDetail() });
  expect(screen.getByRole('button', { name: 'Registrar salida' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Registrar llegada' })).not.toBeInTheDocument();
});

it('offers the arrival once the trip is on the road', () => {
  setup({
    data: tripDetail({ status: 'IN_TRANSIT', departure: departureRecord(), canDelete: false }),
  });

  expect(screen.getByRole('button', { name: 'Registrar llegada' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Registrar salida' })).not.toBeInTheDocument();
});

it('leads back to the trips of the branch from the breadcrumb', () => {
  setup({ data: tripDetail() });

  const nav = screen.getByRole('navigation', { name: 'Ruta de navegación' });
  expect(nav).toHaveTextContent('C-482BTX · 20 oct');
  expect(screen.getByRole('link', { name: 'Viajes' })).toHaveAttribute('href', '/sucursal/viajes');
});

it('leads the driver back to their own trips', () => {
  setup({ data: tripDetail() }, 'driver');

  expect(screen.getByRole('link', { name: 'Mis viajes' })).toHaveAttribute('href', '/chofer');
});

it('shows a loading state while the trip arrives', () => {
  setup({ pending: true });

  expect(screen.getByLabelText('Cargando')).toBeInTheDocument();
});

it('says the trip was not found and leads back', () => {
  setup({ error: new ApiError(404, 'No encontramos ese viaje.') });

  expect(screen.getByText('No encontramos ese viaje.')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Volver a los viajes' })).toHaveAttribute(
    'href',
    '/sucursal/viajes',
  );
});

it('shows a friendly error with a retry for any other failure', async () => {
  const { refetch } = setup({ error: new ApiError(503, 'El servicio no respondió.') });

  expect(screen.getByRole('alert')).toHaveTextContent('El servicio no respondió.');
  await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

  expect(refetch).toHaveBeenCalled();
});
