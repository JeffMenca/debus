import { guatemalaDateTime } from '@debus/contracts';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api/api-error';
import { useRecordArrival } from '../../hooks/use-trip';
import { arrivalRecord, departureRecord, tripDetail } from '../../test-support/trips';
import { ArrivalCard } from './arrival-card';

jest.mock('../../hooks/use-trip');
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const NOW = new Date('2026-10-20T15:52:30.000Z');
const onTheRoad = {
  status: 'IN_TRANSIT' as const,
  departure: departureRecord(),
};

function setup(over: Parameters<typeof tripDetail>[0] = onTheRoad, mutateAsync = jest.fn()) {
  jest.mocked(useRecordArrival).mockReturnValue({ mutateAsync } as never);
  render(<ArrivalCard trip={tripDetail(over)} />);
  return { mutateAsync };
}

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

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

describe('ArrivalCard before the departure', () => {
  it('asks for the departure first and offers no form', () => {
    setup({});

    expect(screen.getByText('Primero registra la salida.')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('ArrivalCard on the road', () => {
  it('starts on the day and hour of Guatemala now', () => {
    setup();

    expect(screen.getByLabelText('Fecha')).toHaveValue('2026-10-20');
    expect(screen.getByLabelText('Hora')).toHaveValue('09:52');
    expect(screen.getByLabelText('Kilometraje final')).toHaveValue('');
  });

  it('previews the distance, the depreciation and the driver pay while typing', () => {
    setup();

    expect(screen.getByText('Recorrido').parentElement).toHaveTextContent('—');
    type('Kilometraje final', '148614');

    expect(screen.getByText('Recorrido').parentElement).toHaveTextContent('204 km');
    expect(screen.getByText(/Depreciación/).parentElement).toHaveTextContent(/Q\s?173\.40/);
    expect(screen.getByText(/Depreciación/)).toHaveTextContent('Q 0.85/km');
    expect(screen.getByText('Pago al chofer').parentElement).toHaveTextContent(/Q\s?250\.00/);
  });

  it('says so when the final mileage is below the starting one', () => {
    setup();

    type('Kilometraje final', '148000');

    expect(screen.getByText('El kilometraje final no puede ser menor a 148,410.')).toBeVisible();
    expect(screen.getByText('Recorrido').parentElement).toHaveTextContent('—');
  });

  it('says so, and computes nothing, when the final mileage is a typing mistake', () => {
    setup();

    type('Kilometraje final', '1483100');

    expect(screen.getByText(/demasiado alto para un solo viaje/)).toBeVisible();
    expect(screen.getByText('Recorrido').parentElement).toHaveTextContent('—');
    expect(screen.getByText(/Depreciación/).parentElement).toHaveTextContent('—');
    expect(screen.getByText(/Depreciación/).parentElement).not.toHaveTextContent(/Q\s?1,/);
  });

  it('says there is no rate when none is configured and lets the service answer', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const { mutateAsync } = setup(
      { ...onTheRoad, depreciationPerKmToday: null },
      jest.fn().mockRejectedValue(new ApiError(409, 'Falta configurar el monto de depreciación.')),
    );

    type('Kilometraje final', '148614');
    type('Combustible total (Q)', '1180');
    expect(screen.getByText(/Depreciación/).parentElement).toHaveTextContent(
      'Sin monto configurado',
    );
    await user.click(screen.getByRole('button', { name: 'Registrar llegada' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('checkbox'));
    await user.click(within(dialog).getByRole('button', { name: 'Sí, registrar llegada' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Falta configurar el monto de depreciación.',
    );
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByLabelText('Fecha')).toHaveFocus());
  });

  it('asks for a check, summarizes the figures and sends the real arrival', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const { mutateAsync } = setup(onTheRoad, jest.fn().mockResolvedValue(undefined));

    type('Hora', '09:52');
    type('Kilometraje final', '148614');
    type('Combustible total (Q)', '1,180.50');
    await user.click(screen.getByRole('button', { name: 'Registrar llegada' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('20/10/2026 09:52')).toBeInTheDocument();
    expect(within(dialog).getByText('148,614 km')).toBeInTheDocument();
    expect(within(dialog).getByText(/Q\s?1,180\.50/)).toBeInTheDocument();
    const confirm = within(dialog).getByRole('button', { name: 'Sí, registrar llegada' });
    expect(confirm).toBeDisabled();
    await user.click(
      within(dialog).getByRole('checkbox', { name: 'Revisé los datos: no se podrán cambiar' }),
    );
    await user.click(confirm);

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        arrivedAt: guatemalaDateTime('2026-10-20', '09:52'),
        endMileageKm: 148614,
        fuelCost: 1180.5,
      }),
    );
    expect(toast.success).toHaveBeenCalledWith('Registramos la llegada.');
  });

  it('marks each missing or wrong value and does not open the confirmation', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const { mutateAsync } = setup();

    type('Hora', '');
    await user.click(screen.getByRole('button', { name: 'Registrar llegada' }));

    expect(screen.getByText('Elige la hora de llegada.')).toBeInTheDocument();
    expect(
      screen.getByText('Escribe el kilometraje final con números enteros.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Escribe el combustible total en quetzales, mayor que cero y con hasta dos decimales.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Hora')).toHaveFocus();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('does not let the arrival be before the departure', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    setup();

    type('Hora', '05:00');
    type('Kilometraje final', '148614');
    type('Combustible total (Q)', '1180');
    await user.click(screen.getByRole('button', { name: 'Registrar llegada' }));

    expect(screen.getByText('La llegada no puede ser antes de la salida.')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});

describe('ArrivalCard after the arrival', () => {
  it('shows the saved figures locked, with no field to edit', () => {
    setup({
      status: 'COMPLETED',
      departure: departureRecord(),
      arrival: arrivalRecord(),
    });

    expect(screen.getByText('Registrada, no editable')).toBeInTheDocument();
    expect(screen.getByText('20/10/2026 09:52')).toBeInTheDocument();
    expect(screen.getByText('148,614 km')).toBeInTheDocument();
    expect(screen.getByText('Combustible').parentElement).toHaveTextContent(/Q\s?1,180\.00/);
    expect(screen.getByText('Recorrido').parentElement).toHaveTextContent('204 km');
    expect(screen.getByText(/Depreciación/)).toHaveTextContent('Q 0.85/km');
    expect(screen.getByText(/Depreciación/).parentElement).toHaveTextContent(/Q\s?173\.40/);
    expect(screen.getByText('Pago al chofer').parentElement).toHaveTextContent(/Q\s?250\.00/);
    expect(screen.getByText('Registrada por el chofer')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
