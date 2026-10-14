import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api/api-error';
import { useDeleteTrip } from '../../hooks/use-trip';
import { tripDetail } from '../../test-support/trips';
import { DeleteTripCard } from './delete-trip-card';

jest.mock('../../hooks/use-trip');
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

function setup(over: Parameters<typeof tripDetail>[0] = {}, mutateAsync = jest.fn()) {
  jest.mocked(useDeleteTrip).mockReturnValue({ mutateAsync } as never);
  render(<DeleteTripCard trip={tripDetail(over)} />);
  return { mutateAsync };
}

beforeEach(() => push.mockReset());

it('says why a trip cannot be deleted and disables the button', () => {
  setup({ canDelete: false, status: 'IN_TRANSIT' });

  expect(
    screen.getByText(
      'No disponible: el viaje ya salió. Solo se eliminan viajes que no han salido.',
    ),
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Eliminar' })).toBeDisabled();
});

it('asks for a check, deletes and goes back to the list', async () => {
  const { mutateAsync } = setup({}, jest.fn().mockResolvedValue(undefined));
  const trip = tripDetail();

  await userEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
  const dialog = await screen.findByRole('alertdialog');
  const confirm = within(dialog).getByRole('button', { name: 'Eliminar viaje' });
  expect(confirm).toBeDisabled();
  await userEvent.click(
    within(dialog).getByRole('checkbox', {
      name: 'Entiendo que se avisará a quienes compraron boletos.',
    }),
  );
  await userEvent.click(confirm);

  await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith(trip.id));
  expect(push).toHaveBeenCalledWith('/sucursal/viajes');
  expect(toast.success).toHaveBeenCalledWith('Eliminamos el viaje.');
});

it('tells that a rental goes back to the rentals waiting for a bus', async () => {
  setup({ type: 'RENTAL', routeId: null, ticketPrice: null });

  await userEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
  const dialog = await screen.findByRole('alertdialog');

  expect(
    within(dialog).getByRole('checkbox', {
      name: 'Entiendo que el alquiler volverá a la lista de alquileres por asignar.',
    }),
  ).toBeInTheDocument();
});

it('keeps the person on the trip and shows the text of the service when it refuses', async () => {
  setup({}, jest.fn().mockRejectedValue(new ApiError(409, 'Ese viaje ya salió.')));

  await userEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
  const dialog = await screen.findByRole('alertdialog');
  await userEvent.click(within(dialog).getByRole('checkbox'));
  await userEvent.click(within(dialog).getByRole('button', { name: 'Eliminar viaje' }));

  expect(await within(dialog).findByRole('alert')).toHaveTextContent('Ese viaje ya salió.');
  expect(push).not.toHaveBeenCalled();
});
