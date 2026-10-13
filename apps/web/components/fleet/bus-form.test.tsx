import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api/api-error';
import { useDriverOptions } from '../../hooks/use-drivers';
import { useSaveBus, useUploadBusPhoto } from '../../hooks/use-buses';
import { bus, driver, driverPage } from '../../test-support/fleet';
import { BusForm } from './bus-form';

jest.mock('../../hooks/use-buses');
jest.mock('../../hooks/use-drivers');
jest.mock('../../hooks/use-photo', () => ({ usePhoto: () => null }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const user = userEvent.setup({ applyAccept: false });
const JULIO_ID = '11111111-1111-4111-8111-111111111111';
const ANA_ID = '22222222-2222-4222-8222-222222222222';
const MARTA_ID = '33333333-3333-4333-8333-333333333333';
const julio = driver({ id: JULIO_ID, fullName: 'Julio Pérez' });
const ana = driver({ id: ANA_ID, fullName: 'Ana Sic' });

function setup({
  existing,
  save = jest.fn().mockResolvedValue(bus()),
  upload = jest.fn().mockResolvedValue(undefined),
  options = driverPage([julio, ana]),
}: {
  existing?: ReturnType<typeof bus>;
  save?: jest.Mock;
  upload?: jest.Mock;
  options?: ReturnType<typeof driverPage>;
} = {}) {
  jest.mocked(useSaveBus).mockReturnValue({ mutateAsync: save } as never);
  jest.mocked(useUploadBusPhoto).mockReturnValue({ mutateAsync: upload } as never);
  jest.mocked(useDriverOptions).mockReturnValue({ data: options } as never);
  const onDone = jest.fn();
  render(<BusForm bus={existing} onDone={onDone} />);
  return { save, upload, onDone };
}

async function fillRequired() {
  await user.type(screen.getByLabelText('Placa'), 'c-482 btx');
  await user.type(screen.getByLabelText('Marca'), 'Volvo');
  await user.type(screen.getByLabelText('Modelo'), 'B8R');
  await user.type(screen.getByLabelText('Año'), '2021');
  await user.type(screen.getByLabelText('Capacidad'), '40');
  await user.type(screen.getByLabelText('Kilometraje'), '1000');
}
const submit = () =>
  user.click(screen.getByRole('button', { name: /Registrar bus|Guardar cambios/ }));
const choose = async (label: string, option: string) => {
  await user.click(screen.getByRole('combobox', { name: label }));
  await user.click(await screen.findByRole('option', { name: option }));
};

beforeEach(() => {
  jest.mocked(toast.success).mockReset();
  jest.mocked(toast.error).mockReset();
  Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: jest.fn() });
});

it('sends the plate in its normal form and a driver left unassigned', async () => {
  const { save, onDone } = setup();
  await fillRequired();

  await submit();

  await waitFor(() => expect(onDone).toHaveBeenCalled());
  expect(save).toHaveBeenCalledWith({
    id: undefined,
    fields: {
      plate: 'C482BTX',
      brand: 'Volvo',
      model: 'B8R',
      year: 2021,
      capacity: 40,
      mileageKm: 1000,
      operationalStatus: 'AVAILABLE',
      assignedDriverId: null,
    },
  });
  expect(toast.success).toHaveBeenCalledWith('Registramos el bus C-482BTX.');
});

it('says what is missing and sends nothing', async () => {
  const { save } = setup();

  await submit();

  expect(await screen.findByText('Escribe la placa, por ejemplo C-482BTX.')).toBeInTheDocument();
  expect(screen.getByText('Escribe la marca.')).toBeInTheDocument();
  expect(screen.getByText('Escribe el modelo.')).toBeInTheDocument();
  expect(screen.getByText(/Escribe un año entre 1980 y/)).toBeInTheDocument();
  expect(screen.getByText('La capacidad va de 10 a 80 asientos.')).toBeInTheDocument();
  expect(screen.getByText('Escribe el kilometraje, de 0 en adelante.')).toBeInTheDocument();
  expect(save).not.toHaveBeenCalled();
});

it('puts a bus in the workshop and picks the plant driver', async () => {
  const { save } = setup();
  await fillRequired();
  await choose('Estado', 'En taller');
  await choose('Chofer de planta', 'Ana Sic');

  await submit();

  await waitFor(() => expect(save).toHaveBeenCalled());
  expect(save.mock.calls[0][0].fields).toMatchObject({
    operationalStatus: 'IN_WORKSHOP',
    assignedDriverId: ANA_ID,
  });
});

it('can take the driver away again', async () => {
  const { save } = setup({
    existing: bus({ assignedDriverId: JULIO_ID, assignedDriverName: 'Julio Pérez' }),
  });

  await choose('Chofer de planta', 'Sin asignar');
  await submit();

  await waitFor(() => expect(save).toHaveBeenCalled());
  expect(save.mock.calls[0][0].fields.assignedDriverId).toBeNull();
});

it('keeps the current driver in the list even when the search leaves them out', async () => {
  setup({
    existing: bus({ assignedDriverId: MARTA_ID, assignedDriverName: 'Marta Coyoy' }),
    options: driverPage([julio]),
  });

  expect(screen.getByRole('combobox', { name: 'Chofer de planta' })).toHaveTextContent(
    'Marta Coyoy',
  );
});

describe('drivers that already have a bus', () => {
  const marta = driver({
    id: MARTA_ID,
    fullName: 'Marta Coyoy',
    assignedBusPlate: 'C731PLR',
  });

  it('lists them as disabled options that say which bus they are in', async () => {
    setup({ options: driverPage([julio, marta]) });

    await user.click(screen.getByRole('combobox', { name: 'Chofer de planta' }));

    expect(await screen.findByRole('option', { name: 'Julio Pérez' })).not.toHaveAttribute(
      'aria-disabled',
    );
    expect(
      screen.getByRole('option', { name: 'Marta Coyoy (en el bus C-731PLR)' }),
    ).toHaveAttribute('aria-disabled', 'true');
  });

  it('keeps selectable the driver already assigned to this same bus', async () => {
    setup({
      existing: bus({ assignedDriverId: MARTA_ID, plate: 'C731PLR' }),
      options: driverPage([julio, marta]),
    });

    await user.click(screen.getByRole('combobox', { name: 'Chofer de planta' }));

    expect(await screen.findByRole('option', { name: 'Marta Coyoy' })).not.toHaveAttribute(
      'aria-disabled',
    );
  });
});

it('shows a plate that is already taken next to the plate', async () => {
  const { onDone } = setup({
    save: jest.fn().mockRejectedValue(new ApiError(409, 'Ya existe un bus con esa placa.')),
  });
  await fillRequired();

  await submit();

  const message = await screen.findByText('Ya existe un bus con esa placa.');
  expect(message).toHaveAttribute('id', 'bus-plate-error');
  expect(screen.getByLabelText('Placa')).toHaveAttribute('aria-invalid', 'true');
  expect(screen.getByLabelText('Placa')).toHaveFocus();
  expect(onDone).not.toHaveBeenCalled();
});

it('shows a driver that is already assigned next to the driver', async () => {
  setup({
    save: jest.fn().mockRejectedValue(new ApiError(409, 'Ese chofer ya está asignado a otro bus.')),
  });
  await fillRequired();

  await submit();

  expect(await screen.findByText('Ese chofer ya está asignado a otro bus.')).toHaveAttribute(
    'id',
    'bus-driver-error',
  );
  expect(screen.getByRole('combobox', { name: 'Chofer de planta' })).toHaveFocus();
});

it('shows any other failure at the top of the form', async () => {
  setup({ save: jest.fn().mockRejectedValue(new ApiError(0, 'No pudimos conectarnos.')) });
  await fillRequired();

  await submit();

  expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos conectarnos.');
});

it('saves the bus first and then its photo', async () => {
  const order: string[] = [];
  const save = jest.fn().mockImplementation(async () => {
    order.push('bus');
    return bus({ id: 'new-bus' });
  });
  const upload = jest.fn().mockImplementation(async () => {
    order.push('photo');
  });
  const { onDone } = setup({ save, upload });
  await fillRequired();
  const file = new File(['x'], 'bus.jpg', { type: 'image/jpeg' });
  await user.upload(screen.getByLabelText('Foto del bus'), file);

  await submit();

  await waitFor(() => expect(onDone).toHaveBeenCalled());
  expect(order).toEqual(['bus', 'photo']);
  expect(upload).toHaveBeenCalledWith({ id: 'new-bus', file });
});

it('keeps the bus and says so when only the photo fails', async () => {
  const { onDone } = setup({
    upload: jest.fn().mockRejectedValue(new ApiError(400, 'Foto mala.')),
  });
  await fillRequired();
  await user.upload(
    screen.getByLabelText('Foto del bus'),
    new File(['x'], 'bus.jpg', { type: 'image/jpeg' }),
  );

  await submit();

  await waitFor(() => expect(onDone).toHaveBeenCalled());
  expect(toast.error).toHaveBeenCalledWith(
    'Guardamos el bus, pero no la foto. Intenta subirla de nuevo.',
  );
  expect(toast.success).not.toHaveBeenCalled();
});

describe('editing', () => {
  it('starts from the saved bus and saves with the same version of the data', async () => {
    const { save } = setup({ existing: bus({ id: 'b-1', mileageKm: 150000 }) });

    expect(screen.getByLabelText('Placa')).toHaveValue('C-482BTX');
    expect(screen.getByLabelText('Kilometraje')).toHaveValue(150000);
    await submit();

    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save).toHaveBeenCalledWith({
      id: 'b-1',
      fields: expect.objectContaining({ plate: 'C482BTX', mileageKm: 150000 }),
    });
    expect(toast.success).toHaveBeenCalledWith('Guardamos los cambios del bus C-482BTX.');
  });
});

it('searches the drivers on the server once there are more than the list shows', async () => {
  setup({ options: driverPage([julio], { total: 120 }) });

  await user.type(screen.getByRole('searchbox', { name: 'Buscar chofer' }), 'ana');

  await waitFor(() => expect(useDriverOptions).toHaveBeenLastCalledWith('ana'));
});

it('does not show the driver search when the whole list fits', () => {
  setup();

  expect(screen.queryByRole('searchbox', { name: 'Buscar chofer' })).not.toBeInTheDocument();
});
