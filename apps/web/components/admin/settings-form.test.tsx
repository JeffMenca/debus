import { todayInGuatemala } from '@debus/contracts';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api/api-error';
import { useCreateSettings } from '../../hooks/use-settings';
import { SettingsForm } from './settings-form';

jest.mock('../../hooks/use-settings');
jest.mock('sonner', () => ({ toast: { success: jest.fn() } }));

function setup(mutateAsync = jest.fn().mockResolvedValue({})) {
  jest.mocked(useCreateSettings).mockReturnValue({ mutateAsync } as never);
  render(<SettingsForm />);
  return { mutateAsync };
}

const depreciation = () => screen.getByLabelText('Depreciación por kilómetro (Q)');
const rental = () => screen.getByLabelText('Tarifa de alquiler por kilómetro (Q)');

describe('SettingsForm', () => {
  beforeEach(() => jest.mocked(toast.success).mockReset());

  it('starts on today with a minimum of today and explains that history is kept', () => {
    setup();

    expect(screen.getByLabelText('Vigente desde')).toHaveValue(todayInGuatemala());
    expect(screen.getByLabelText('Vigente desde')).toHaveAttribute('min', todayInGuatemala());
    expect(
      screen.getByText('Los viajes ya registrados conservan el monto con el que se calcularon.'),
    ).toBeInTheDocument();
  });

  it('asks for both amounts', async () => {
    const { mutateAsync } = setup();

    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambio' }));

    expect(await screen.findAllByText('Escribe un monto mayor que cero.')).toHaveLength(2);
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('stops at two decimals while typing', async () => {
    setup();
    await userEvent.type(depreciation(), '1.255');

    expect(depreciation()).toHaveValue('1.25');
  });

  it('refuses a date before today', async () => {
    const { mutateAsync } = setup();
    await userEvent.type(depreciation(), '1.25');
    await userEvent.type(rental(), '12');
    fireEvent.change(screen.getByLabelText('Vigente desde'), { target: { value: '2020-01-01' } });

    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambio' }));

    expect(await screen.findByText('Elige hoy o una fecha posterior.')).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('saves the change, announces it and clears the form', async () => {
    const { mutateAsync } = setup();
    await userEvent.type(depreciation(), '1.35');
    await userEvent.type(rental(), '13.5');

    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambio' }));

    expect(mutateAsync).toHaveBeenCalledWith({
      depreciationPerKm: 1.35,
      rentalRatePerKm: 13.5,
      effectiveFrom: todayInGuatemala(),
    });
    expect(toast.success).toHaveBeenCalledWith(
      expect.stringMatching(
        /^Guardamos la configuración\. Rige desde el \d{1,2} de \w+ de \d{4}\.$/,
      ),
    );
    expect(depreciation()).toHaveValue('');
    expect(screen.getByLabelText('Vigente desde')).toHaveValue(todayInGuatemala());
  });

  it('shows the server message when it refuses the change', async () => {
    setup(
      jest
        .fn()
        .mockRejectedValue(new ApiError(400, 'La fecha de vigencia no puede ser anterior a hoy.')),
    );
    await userEvent.type(depreciation(), '1.35');
    await userEvent.type(rental(), '13.5');

    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambio' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'La fecha de vigencia no puede ser anterior a hoy.',
    );
  });
});
