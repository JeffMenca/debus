import { guatemalaDateTime } from '@debus/contracts';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api/api-error';
import { useBusesPage } from '../../hooks/use-buses';
import { useDriverOptions } from '../../hooks/use-drivers';
import { useAssignRental } from '../../hooks/use-rental-requests';
import { bus, busPage, driver, driverPage } from '../../test-support/fleet';
import { rentalRequest, trip } from '../../test-support/trips';
import { AssignRentalDialog } from './assign-rental-dialog';

jest.mock('../../hooks/use-buses');
jest.mock('../../hooks/use-drivers');
jest.mock('../../hooks/use-rental-requests');
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const user = userEvent.setup({ applyAccept: false });
const JULIO_ID = '11111111-1111-4111-8111-111111111111';
const ANA_ID = '22222222-2222-4222-8222-222222222222';
const BUS_ID = '33333333-3333-4333-8333-333333333333';
const SMALL_BUS_ID = '44444444-4444-4444-8444-444444444444';

const julio = driver({ id: JULIO_ID, fullName: 'Julio Pérez' });
const ana = driver({ id: ANA_ID, fullName: 'Ana Sic' });
const buses = [
  bus({
    id: BUS_ID,
    plate: 'C482BTX',
    capacity: 40,
    assignedDriverId: JULIO_ID,
    assignedDriverName: 'Julio Pérez',
  }),
  bus({ id: SMALL_BUS_ID, plate: 'C731PLR', capacity: 30 }),
];

function setup({
  assign = jest.fn().mockResolvedValue(trip()),
  request = rentalRequest(),
}: { assign?: jest.Mock; request?: ReturnType<typeof rentalRequest> } = {}) {
  jest.mocked(useBusesPage).mockReturnValue({ data: busPage(buses) } as never);
  jest.mocked(useDriverOptions).mockReturnValue({ data: driverPage([julio, ana]) } as never);
  jest.mocked(useAssignRental).mockReturnValue({ mutateAsync: assign } as never);
  const onOpenChange = jest.fn();
  render(<AssignRentalDialog request={request} onOpenChange={onOpenChange} />);
  return { assign, onOpenChange };
}

const choose = async (label: string, option: string | RegExp) => {
  await user.click(screen.getByRole('combobox', { name: label }));
  await user.click(await screen.findByRole('option', { name: option }));
};
const submit = () => user.click(screen.getByRole('button', { name: 'Asignar' }));

beforeEach(() => {
  jest.mocked(toast.success).mockReset();
});

it('names the rental it is about and asks for bus, driver and estimated arrival', () => {
  setup();

  const dialog = screen.getByRole('dialog', { name: 'Asignar bus y chofer' });
  expect(dialog).toHaveTextContent('Colegio San José');
  expect(dialog).toHaveTextContent('Quetzaltenango a Antigua Guatemala');
  expect(dialog).toHaveTextContent('38 pasajeros');
  expect(screen.getByRole('combobox', { name: 'Bus' })).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'Chofer' })).toBeInTheDocument();
});

it('proposes the return of the client as the estimated arrival', () => {
  setup();

  expect(screen.getByLabelText('Día de llegada')).toHaveValue('2026-10-24');
  expect(screen.getByLabelText('Hora de llegada')).toHaveValue('16:00');
});

it('proposes four hours after the departure when the rental is one way', () => {
  setup({ request: rentalRequest({ returnAt: null }) });

  expect(screen.getByLabelText('Día de llegada')).toHaveValue('2026-10-24');
  expect(screen.getByLabelText('Hora de llegada')).toHaveValue('10:00');
});

it('offers only available buses and active drivers, as the trip dialog does', () => {
  setup();

  expect(useBusesPage).toHaveBeenCalledWith({ status: 'AVAILABLE', page: 1, pageSize: 100 });
  expect(useDriverOptions).toHaveBeenCalledWith(undefined);
});

it('disables the buses with fewer seats than passengers and says why', async () => {
  setup();

  await user.click(screen.getByRole('combobox', { name: 'Bus' }));

  expect(await screen.findByRole('option', { name: 'C-482BTX · 40 asientos' })).toBeEnabled();
  expect(
    screen.getByRole('option', { name: 'C-731PLR · 30 asientos (menos asientos)' }),
  ).toHaveAttribute('aria-disabled', 'true');
});

it('proposes the plant driver of the bus and sends the assignment', async () => {
  const { assign, onOpenChange } = setup();

  await choose('Bus', /C-482BTX/);
  expect(screen.getByRole('combobox', { name: 'Chofer' })).toHaveTextContent('Julio Pérez');
  await submit();

  await waitFor(() =>
    expect(assign).toHaveBeenCalledWith({
      busId: BUS_ID,
      driverId: JULIO_ID,
      estimatedArrivalAt: guatemalaDateTime('2026-10-24', '16:00'),
    }),
  );
  expect(toast.success).toHaveBeenCalledWith('Asignamos el bus y el chofer a Colegio San José.');
  expect(onOpenChange).toHaveBeenCalledWith(false);
});

it('says what is missing before asking the service', async () => {
  const { assign } = setup();

  await submit();

  expect(screen.getByText('Elige el bus.')).toBeInTheDocument();
  expect(screen.getByText('Elige el chofer.')).toBeInTheDocument();
  expect(assign).not.toHaveBeenCalled();
});

it('refuses an arrival that is not after the departure', async () => {
  const { assign } = setup();

  await choose('Bus', /C-482BTX/);
  fireEvent.change(screen.getByLabelText('Hora de llegada'), { target: { value: '05:00' } });
  await submit();

  expect(
    screen.getByText('La llegada debe ser después de la salida del alquiler.'),
  ).toBeInTheDocument();
  expect(assign).not.toHaveBeenCalled();
});

it('puts the focus on the arrival hour when it is the first thing left to fix', async () => {
  setup();
  await choose('Bus', /C-482BTX/);
  fireEvent.change(screen.getByLabelText('Hora de llegada'), { target: { value: '' } });

  await submit();

  await waitFor(() => expect(screen.getByLabelText('Hora de llegada')).toHaveFocus());
});

it('shows a clash of the bus next to its field, focuses it and keeps the dialog open', async () => {
  const { onOpenChange } = setup({
    assign: jest
      .fn()
      .mockRejectedValue(new ApiError(409, 'Ese bus ya tiene un viaje en ese horario.')),
  });

  await choose('Bus', /C-482BTX/);
  await submit();

  expect(await screen.findByText('Ese bus ya tiene un viaje en ese horario.')).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'Bus' })).toHaveAttribute('aria-invalid', 'true');
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Bus' })).toHaveFocus());
  expect(onOpenChange).not.toHaveBeenCalledWith(false);
});

it('shows a clash of the driver next to the driver field', async () => {
  setup({
    assign: jest
      .fn()
      .mockRejectedValue(new ApiError(409, 'Ese chofer ya tiene un viaje en ese horario.')),
  });

  await choose('Bus', /C-482BTX/);
  await submit();

  expect(
    await screen.findByText('Ese chofer ya tiene un viaje en ese horario.'),
  ).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'Chofer' })).toHaveAttribute('aria-invalid', 'true');
});

it('shows any other refusal on top of the form', async () => {
  setup({
    assign: jest
      .fn()
      .mockRejectedValue(
        new ApiError(503, 'El servicio no respondió. Intenta de nuevo en unos segundos.'),
      ),
  });

  await choose('Bus', /C-482BTX/);
  await submit();

  expect(await screen.findByRole('alert')).toHaveTextContent('El servicio no respondió.');
});

it('closes without assigning when the person cancels', async () => {
  const { assign, onOpenChange } = setup();

  await user.click(screen.getByRole('button', { name: 'Cancelar' }));

  expect(onOpenChange).toHaveBeenCalledWith(false);
  expect(assign).not.toHaveBeenCalled();
});

it('stays closed while there is no rental to assign', () => {
  jest.mocked(useBusesPage).mockReturnValue({ data: undefined } as never);
  jest.mocked(useDriverOptions).mockReturnValue({ data: undefined } as never);
  jest.mocked(useAssignRental).mockReturnValue({ mutateAsync: jest.fn() } as never);

  render(<AssignRentalDialog request={null} onOpenChange={jest.fn()} />);

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

describe('a rental whose requested hour already passed', () => {
  beforeEach(() =>
    jest.useFakeTimers({
      now: new Date('2026-10-24T13:00:00.000Z'),
      doNotFake: [
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
        'setImmediate',
        'clearImmediate',
        'nextTick',
        'queueMicrotask',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'performance',
      ],
    }),
  );
  afterEach(() => jest.useRealTimers());

  it('warns that the trip leaves as soon as it is registered', () => {
    setup();

    expect(screen.getByRole('status')).toHaveTextContent(
      'La hora de salida pedida ya pasó: el viaje saldrá en cuanto lo registres.',
    );
  });

  it('says nothing when the requested hour is still ahead', () => {
    setup({ request: rentalRequest({ departureAt: '2026-10-25T12:00:00.000Z' }) });

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
