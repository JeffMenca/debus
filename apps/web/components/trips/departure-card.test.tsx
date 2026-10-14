import { guatemalaDateTime } from '@debus/contracts';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api/api-error';
import { useRecordDeparture } from '../../hooks/use-trip';
import { departureRecord, tripDetail } from '../../test-support/trips';
import { DepartureCard } from './departure-card';

jest.mock('../../hooks/use-trip');
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const NOW = new Date('2026-10-20T11:34:40.000Z');

function setup(over: Parameters<typeof tripDetail>[0] = {}, mutateAsync = jest.fn()) {
  jest.mocked(useRecordDeparture).mockReturnValue({ mutateAsync } as never);
  render(<DepartureCard trip={tripDetail(over)} />);
  return { mutateAsync };
}

beforeEach(() => {
  jest.useFakeTimers({
    now: NOW,
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
});
afterEach(() => jest.useRealTimers());

describe('DepartureCard before the departure', () => {
  it('starts on the day and hour of Guatemala now, with the mileage of the bus', () => {
    setup();

    expect(screen.getByLabelText('Fecha')).toHaveValue('2026-10-20');
    expect(screen.getByLabelText('Hora')).toHaveValue('05:34');
    expect(screen.getByLabelText('Kilometraje inicial')).toHaveValue('148410');
    expect(screen.getByRole('button', { name: 'Registrar salida' })).toBeEnabled();
  });

  it('asks for a check before saving and then sends the real departure', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const { mutateAsync } = setup({}, jest.fn().mockResolvedValue(undefined));

    fireEvent.change(screen.getByLabelText('Hora'), { target: { value: '05:40' } });
    fireEvent.change(screen.getByLabelText('Kilometraje inicial'), {
      target: { value: '148,415' },
    });
    await user.click(screen.getByRole('button', { name: 'Registrar salida' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('148,415 km')).toBeInTheDocument();
    expect(within(dialog).getByText('20/10/2026 05:40')).toBeInTheDocument();
    const confirm = within(dialog).getByRole('button', { name: 'Sí, registrar salida' });
    expect(confirm).toBeDisabled();
    await user.click(
      within(dialog).getByRole('checkbox', { name: 'Revisé los datos: no se podrán cambiar' }),
    );
    await user.click(confirm);

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        departedAt: guatemalaDateTime('2026-10-20', '05:40'),
        startMileageKm: 148415,
      }),
    );
    expect(toast.success).toHaveBeenCalledWith('Registramos la salida.');
  });

  it('says what is missing before opening the confirmation', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const { mutateAsync } = setup();

    fireEvent.change(screen.getByLabelText('Hora'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Kilometraje inicial'), { target: { value: 'abc' } });
    await user.click(screen.getByRole('button', { name: 'Registrar salida' }));

    expect(screen.getByText('Elige la hora de salida.')).toBeInTheDocument();
    expect(
      screen.getByText('Escribe el kilometraje inicial con números enteros.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Hora')).toHaveFocus();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('refuses to register the departure of a trip scheduled for next week', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const { mutateAsync } = setup({ departureAt: '2026-10-27T11:30:00.000Z' });

    await user.click(screen.getByRole('button', { name: 'Registrar salida' }));

    expect(screen.getByText(/Este viaje está programado para más tarde/)).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('shows the text of the service in the card and puts the focus on the first field', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    setup(
      {},
      jest
        .fn()
        .mockRejectedValue(
          new ApiError(409, 'El kilometraje inicial no puede ser menor al del bus.'),
        ),
    );

    await user.click(screen.getByRole('button', { name: 'Registrar salida' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('checkbox'));
    await user.click(within(dialog).getByRole('button', { name: 'Sí, registrar salida' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El kilometraje inicial no puede ser menor al del bus.',
    );
    await waitFor(() => expect(screen.getByLabelText('Fecha')).toHaveFocus());
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('warns when the bus was deactivated and does not let the departure through', () => {
    setup({ busActive: false });

    expect(screen.getByRole('alert')).toHaveTextContent('El bus de este viaje fue desactivado');
    expect(screen.getByRole('button', { name: 'Registrar salida' })).toBeDisabled();
  });

  it('warns when the driver was deactivated', () => {
    setup({ driverActive: false });

    expect(screen.getByRole('alert')).toHaveTextContent('El chofer de este viaje fue desactivado');
    expect(screen.getByRole('button', { name: 'Registrar salida' })).toBeDisabled();
  });
});

describe('DepartureCard after the departure', () => {
  it('shows the record locked, with no field to edit', () => {
    setup({
      status: 'IN_TRANSIT',
      departure: departureRecord({ recordedByRole: 'DRIVER' }),
    });

    expect(screen.getByText('Registrada, no editable')).toBeInTheDocument();
    expect(screen.getByText('20/10/2026 05:34')).toBeInTheDocument();
    expect(screen.getByText('148,410 km')).toBeInTheDocument();
    expect(screen.getByText('C-482BTX')).toBeInTheDocument();
    expect(screen.getByText('Julio Pérez')).toBeInTheDocument();
    expect(screen.getByText('Registrada por el chofer')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('names the branch admin when they recorded it', () => {
    setup({ status: 'IN_TRANSIT', departure: departureRecord() });

    expect(screen.getByText('Registrada por el admin de sucursal')).toBeInTheDocument();
  });
});

it('keeps the card usable when the confirmation closes without saving', async () => {
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  const { mutateAsync } = setup();

  await user.click(screen.getByRole('button', { name: 'Registrar salida' }));
  const dialog = await screen.findByRole('alertdialog');
  await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
  await act(async () => undefined);

  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  expect(mutateAsync).not.toHaveBeenCalled();
});
