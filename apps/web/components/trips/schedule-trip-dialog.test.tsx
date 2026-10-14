import { todayInGuatemala } from '@debus/contracts';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api/api-error';
import { useBusesPage } from '../../hooks/use-buses';
import { useDriverOptions } from '../../hooks/use-drivers';
import { useRoutesPage } from '../../hooks/use-routes';
import { useScheduleTrip } from '../../hooks/use-trips';
import { bus, busPage, driver, driverPage, route, routePage } from '../../test-support/fleet';
import { trip } from '../../test-support/trips';
import { ScheduleTripDialog } from './schedule-trip-dialog';

jest.mock('../../hooks/use-buses');
jest.mock('../../hooks/use-drivers');
jest.mock('../../hooks/use-routes');
jest.mock('../../hooks/use-trips');
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const user = userEvent.setup({ applyAccept: false });
const DAY = '2026-10-20';
const GUATEMALA_ID = 'a3b6e7d4-2c1f-4d0e-8b7a-0e5f4c3d2b1a';
const FLORES_ID = 'b4c7f8e5-3d2a-4e1f-9c8b-1f6a5d4e3c2b';
const JULIO_ID = '11111111-1111-4111-8111-111111111111';
const ANA_ID = '22222222-2222-4222-8222-222222222222';
const BUS_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_BUS_ID = '44444444-4444-4444-8444-444444444444';

const routes = [
  route({ id: GUATEMALA_ID, destinationName: 'Guatemala', distanceKm: 206.5 }),
  route({ id: FLORES_ID, destinationName: 'Flores', distanceKm: 560 }),
];
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
  bus({ id: OTHER_BUS_ID, plate: 'C731PLR', capacity: 44 }),
];

interface SetupOptions {
  schedule?: jest.Mock;
  routeItems?: ReturnType<typeof routePage>;
  busItems?: ReturnType<typeof busPage>;
  driverItems?: ReturnType<typeof driverPage>;
  defaultDay?: string;
}

function setup({
  schedule = jest.fn().mockResolvedValue(trip()),
  routeItems = routePage(routes),
  busItems = busPage(buses),
  driverItems = driverPage([julio, ana]),
  defaultDay = DAY,
}: SetupOptions = {}) {
  jest.mocked(useRoutesPage).mockReturnValue({ data: routeItems } as never);
  jest.mocked(useBusesPage).mockReturnValue({ data: busItems } as never);
  jest.mocked(useDriverOptions).mockReturnValue({ data: driverItems } as never);
  jest.mocked(useScheduleTrip).mockReturnValue({ mutateAsync: schedule } as never);
  const onOpenChange = jest.fn();
  render(<ScheduleTripDialog open onOpenChange={onOpenChange} defaultDay={defaultDay} />);
  return { schedule, onOpenChange };
}

const choose = async (label: string, option: string | RegExp) => {
  await user.click(screen.getByRole('combobox', { name: label }));
  await user.click(await screen.findByRole('option', { name: option }));
};
const setTime = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const submit = () => user.click(screen.getByRole('button', { name: 'Programar' }));

async function fillEverything() {
  await choose('Ruta', /Guatemala/);
  await choose('Bus', /C-482BTX/);
  setTime('Hora de salida', '05:30');
}

beforeEach(() => {
  jest.mocked(toast.success).mockReset();
  jest.mocked(toast.error).mockReset();
});

describe('ScheduleTripDialog', () => {
  it('starts both days on the day it is given and leaves the hours to choose', () => {
    setup();

    expect(screen.getByRole('dialog', { name: 'Programar viaje' })).toBeInTheDocument();
    expect(screen.getByLabelText('Día de salida')).toHaveValue(DAY);
    expect(screen.getByLabelText('Día de llegada')).toHaveValue(DAY);
    expect(screen.getByLabelText('Hora de salida')).toHaveValue('');
    expect(screen.getByLabelText('Hora de llegada')).toHaveValue('');
  });

  it('starts on today when no other day is given', () => {
    setup({ defaultDay: todayInGuatemala() });

    expect(screen.getByLabelText('Día de salida')).toHaveValue(todayInGuatemala());
  });

  it('does not let the departure day be before today', () => {
    setup();

    expect(screen.getByLabelText('Día de salida')).toHaveAttribute('min', todayInGuatemala());
  });

  it('does not let the arrival day be before the departure day', () => {
    setup();
    expect(screen.getByLabelText('Día de llegada')).toHaveAttribute('min', DAY);

    fireEvent.change(screen.getByLabelText('Día de salida'), { target: { value: '2026-10-22' } });

    expect(screen.getByLabelText('Día de llegada')).toHaveAttribute('min', '2026-10-22');
  });

  it('offers only active routes, available buses and active drivers', () => {
    setup();

    expect(useRoutesPage).toHaveBeenCalledWith({ status: 'active', page: 1, pageSize: 100 });
    expect(useBusesPage).toHaveBeenCalledWith({ status: 'AVAILABLE', page: 1, pageSize: 100 });
    expect(useDriverOptions).toHaveBeenCalledWith(undefined);
  });

  it('shows each bus with its plate and seats', async () => {
    setup();

    await user.click(screen.getByRole('combobox', { name: 'Bus' }));

    expect(await screen.findByRole('option', { name: 'C-482BTX · 40 asientos' })).toBeVisible();
    expect(screen.getByRole('option', { name: 'C-731PLR · 44 asientos' })).toBeVisible();
  });

  it('proposes the plant driver of the bus that was chosen, and lets it be changed', async () => {
    setup();

    await choose('Bus', /C-482BTX/);
    expect(screen.getByRole('combobox', { name: 'Chofer' })).toHaveTextContent('Julio Pérez');

    await choose('Chofer', 'Ana Sic');
    expect(screen.getByRole('combobox', { name: 'Chofer' })).toHaveTextContent('Ana Sic');
  });

  it('keeps the driver already chosen when the bus has no plant driver', async () => {
    setup();
    await choose('Chofer', 'Ana Sic');

    await choose('Bus', /C-731PLR/);

    expect(screen.getByRole('combobox', { name: 'Chofer' })).toHaveTextContent('Ana Sic');
  });

  it('keeps the plant driver on the list even when the search leaves them out', async () => {
    setup({ driverItems: driverPage([ana]) });

    await choose('Bus', /C-482BTX/);

    expect(screen.getByRole('combobox', { name: 'Chofer' })).toHaveTextContent('Julio Pérez');
  });

  it('proposes the arrival from the route distance and the departure, in Guatemalan time', async () => {
    setup();

    await choose('Ruta', /Guatemala/);
    expect(screen.getByLabelText('Hora de llegada')).toHaveValue('');
    setTime('Hora de salida', '05:30');

    // 206.5 km at 50 km/h rounds up to 5 hours
    expect(screen.getByLabelText('Día de llegada')).toHaveValue(DAY);
    expect(screen.getByLabelText('Hora de llegada')).toHaveValue('10:30');
  });

  it('moves the arrival to the next day when the proposal crosses midnight', async () => {
    setup();

    await choose('Ruta', /Flores/);
    setTime('Hora de salida', '20:00');

    // 560 km take 12 hours
    expect(screen.getByLabelText('Día de llegada')).toHaveValue('2026-10-21');
    expect(screen.getByLabelText('Hora de llegada')).toHaveValue('08:00');
  });

  it('follows a new departure or route until the person changes the arrival', async () => {
    setup();
    await choose('Ruta', /Guatemala/);
    setTime('Hora de salida', '05:30');

    setTime('Hora de salida', '07:00');
    expect(screen.getByLabelText('Hora de llegada')).toHaveValue('12:00');

    setTime('Hora de llegada', '13:15');
    setTime('Hora de salida', '08:00');
    expect(screen.getByLabelText('Hora de llegada')).toHaveValue('13:15');
    await choose('Ruta', /Flores/);
    expect(screen.getByLabelText('Hora de llegada')).toHaveValue('13:15');
  });

  it('keeps the proposed hour when only the arrival day is changed', async () => {
    setup();
    await choose('Ruta', /Guatemala/);
    setTime('Hora de salida', '05:30');

    fireEvent.change(screen.getByLabelText('Día de llegada'), { target: { value: '2026-10-22' } });

    expect(screen.getByLabelText('Día de llegada')).toHaveValue('2026-10-22');
    expect(screen.getByLabelText('Hora de llegada')).toHaveValue('10:30');
  });

  it('sends the instants in UTC computed from the Guatemalan day and hour', async () => {
    const { schedule, onOpenChange } = setup();
    await fillEverything();

    await submit();

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(schedule).toHaveBeenCalledWith({
      routeId: GUATEMALA_ID,
      busId: BUS_ID,
      driverId: JULIO_ID,
      departureAt: '2026-10-20T11:30:00.000Z',
      estimatedArrivalAt: '2026-10-20T16:30:00.000Z',
    });
    expect(toast.success).toHaveBeenCalledWith('Programamos el viaje a Guatemala.');
  });

  it('says what is missing and sends nothing', async () => {
    const { schedule } = setup();

    await submit();

    expect(await screen.findByText('Elige la ruta del viaje.')).toBeInTheDocument();
    expect(screen.getByText('Elige el bus.')).toBeInTheDocument();
    expect(screen.getByText('Elige el chofer.')).toBeInTheDocument();
    expect(screen.getByText('Elige la hora de salida.')).toBeInTheDocument();
    expect(screen.getByText('Elige la hora de llegada.')).toBeInTheDocument();
    expect(schedule).not.toHaveBeenCalled();
  });

  it('asks for an arrival after the departure', async () => {
    const { schedule } = setup();
    await fillEverything();
    setTime('Hora de llegada', '05:30');

    await submit();

    expect(
      await screen.findByText('La llegada debe ser después de la salida.'),
    ).toBeInTheDocument();
    expect(schedule).not.toHaveBeenCalled();
  });

  it('puts the focus on the route when everything is left empty', async () => {
    setup();

    await submit();

    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Ruta' })).toHaveFocus());
  });

  it('puts the focus on the first field with a problem, in screen order', async () => {
    setup();
    await choose('Ruta', /Guatemala/);

    await submit();

    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Bus' })).toHaveFocus());
  });

  it('puts the focus on the bus when the service says it is busy', async () => {
    setup({
      schedule: jest
        .fn()
        .mockRejectedValue(new ApiError(409, 'Ese bus ya tiene un viaje en ese horario.')),
    });
    await fillEverything();

    await submit();

    await screen.findByText('Ese bus ya tiene un viaje en ese horario.');
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Bus' })).toHaveFocus());
  });

  it('puts a clash of the bus next to the bus field', async () => {
    setup({
      schedule: jest
        .fn()
        .mockRejectedValue(new ApiError(409, 'Ese bus ya tiene un viaje en ese horario.')),
    });
    await fillEverything();

    await submit();

    const message = await screen.findByText('Ese bus ya tiene un viaje en ese horario.');
    expect(message).toHaveAttribute('role', 'alert');
    expect(screen.getByRole('combobox', { name: 'Bus' })).toBeInvalid();
    expect(screen.getByRole('combobox', { name: 'Chofer' })).not.toBeInvalid();
  });

  it.each([
    ['Ese chofer ya tiene un viaje en ese horario.', 'Chofer'],
    ['La licencia de ese chofer estará vencida el día del viaje.', 'Chofer'],
    ['Esa ruta está retirada. Reactívala o elige otra.', 'Ruta'],
  ])('puts "%s" next to the %s field', async (message, field) => {
    setup({ schedule: jest.fn().mockRejectedValue(new ApiError(409, message)) });
    await fillEverything();

    await submit();

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: field })).toBeInvalid();
  });

  it('puts a departure in the past next to the departure', async () => {
    setup({
      schedule: jest.fn().mockRejectedValue(new ApiError(409, 'La salida debe ser en el futuro.')),
    });
    await fillEverything();

    await submit();

    expect(await screen.findByText('La salida debe ser en el futuro.')).toBeInTheDocument();
    expect(screen.getByLabelText('Hora de salida')).toBeInvalid();
  });

  it('shows what it cannot place in a field on top of the form', async () => {
    setup({
      schedule: jest
        .fn()
        .mockRejectedValue(
          new ApiError(503, 'No pudimos revisar la disponibilidad ahora. Intenta de nuevo.'),
        ),
    });
    await fillEverything();

    await submit();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos revisar la disponibilidad ahora. Intenta de nuevo.',
    );
    expect(screen.getByRole('combobox', { name: 'Bus' })).not.toBeInvalid();
  });

  it('clears the previous answer of the service when it tries again', async () => {
    const schedule = jest
      .fn()
      .mockRejectedValueOnce(new ApiError(409, 'Ese bus ya tiene un viaje en ese horario.'))
      .mockResolvedValueOnce(trip());
    const { onOpenChange } = setup({ schedule });
    await fillEverything();
    await submit();
    await screen.findByText('Ese bus ya tiene un viaje en ese horario.');

    await choose('Bus', /C-731PLR/);
    await submit();

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(screen.queryByText('Ese bus ya tiene un viaje en ese horario.')).not.toBeInTheDocument();
  });

  it('says so when there is no bus to choose', () => {
    setup({ busItems: busPage([], { total: 0 }) });

    expect(
      screen.getByText('No hay buses disponibles. Revisa su estado en Buses.'),
    ).toBeInTheDocument();
  });

  it('says so when there is no route to choose', () => {
    setup({ routeItems: routePage([], { total: 0 }) });

    expect(screen.getByText('No hay rutas activas. Crea una en Rutas.')).toBeInTheDocument();
  });

  it('searches on the server when a list is longer than what it shows', async () => {
    setup({ busItems: busPage(buses, { total: 150 }) });

    await user.type(screen.getByRole('searchbox', { name: 'Buscar bus' }), 'volvo');

    await waitFor(() =>
      expect(useBusesPage).toHaveBeenLastCalledWith({
        status: 'AVAILABLE',
        q: 'volvo',
        page: 1,
        pageSize: 100,
      }),
    );
  });

  it('does not show a search box for a short list', () => {
    setup();

    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  });

  it('closes without scheduling from Cancelar', async () => {
    const { schedule, onOpenChange } = setup();

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(schedule).not.toHaveBeenCalled();
  });
});
