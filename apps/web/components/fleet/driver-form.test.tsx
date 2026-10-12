import { todayInGuatemala } from '@debus/contracts';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api/api-error';
import { useSaveDriver, useUploadDriverPhoto } from '../../hooks/use-drivers';
import { driver } from '../../test-support/fleet';
import { DriverForm } from './driver-form';

jest.mock('../../hooks/use-drivers');
jest.mock('../../hooks/use-photo', () => ({ usePhoto: () => null }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const user = userEvent.setup({ applyAccept: false });

function setup({
  existing,
  save = jest.fn().mockResolvedValue(driver()),
  upload = jest.fn().mockResolvedValue(undefined),
}: { existing?: ReturnType<typeof driver>; save?: jest.Mock; upload?: jest.Mock } = {}) {
  jest.mocked(useSaveDriver).mockReturnValue({ mutateAsync: save } as never);
  jest.mocked(useUploadDriverPhoto).mockReturnValue({ mutateAsync: upload } as never);
  const onDone = jest.fn();
  render(<DriverForm driver={existing} onDone={onDone} />);
  return { save, upload, onDone };
}

async function fillRequired() {
  await user.type(screen.getByLabelText('Nombre completo'), 'Julio Pérez');
  await user.type(screen.getByLabelText('Correo'), ' Julio@Correo.com ');
  await user.type(screen.getByLabelText('Teléfono'), '5551-2345');
  await user.type(screen.getByLabelText('Número de licencia'), 'a 123-4567');
  await user.click(screen.getByRole('combobox', { name: 'Tipo de licencia' }));
  await user.click(await screen.findByRole('option', { name: 'Tipo C' }));
  await user.type(screen.getByLabelText('Salario base por viaje (Q)'), '150.50');
}
const submit = () =>
  user.click(screen.getByRole('button', { name: /Registrar chofer|Guardar cambios/ }));

beforeEach(() => {
  jest.mocked(toast.success).mockReset();
  jest.mocked(toast.error).mockReset();
  Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: jest.fn() });
});

it('starts the expiry date on today and lets the person change it', async () => {
  setup();
  const date = screen.getByLabelText('Vencimiento de la licencia');

  expect(date).toHaveValue(todayInGuatemala());
  await user.clear(date);
  await user.type(date, '2028-02-10');

  expect(date).toHaveValue('2028-02-10');
});

it('tells the driver how they will enter debus', () => {
  setup();

  expect(
    screen.getByText(
      'Con este correo entrará a debus para registrar sus salidas. Debe ser solo suyo.',
    ),
  ).toBeInTheDocument();
});

it('sends the driver with the email, phone and licence in their normal form', async () => {
  const { save, onDone } = setup();
  await fillRequired();
  await user.clear(screen.getByLabelText('Vencimiento de la licencia'));
  await user.type(screen.getByLabelText('Vencimiento de la licencia'), '2028-02-10');

  await submit();

  await waitFor(() => expect(onDone).toHaveBeenCalled());
  expect(save).toHaveBeenCalledWith({
    id: undefined,
    fields: {
      fullName: 'Julio Pérez',
      email: 'julio@correo.com',
      phone: '55512345',
      licenseNumber: 'A1234567',
      licenseType: 'C',
      licenseExpiresOn: '2028-02-10',
      baseSalary: 150.5,
    },
  });
  expect(toast.success).toHaveBeenCalledWith(
    'Registramos a Julio Pérez. Le enviamos un correo para crear su contraseña.',
  );
});

it('says what is missing and sends nothing', async () => {
  const { save } = setup();
  await user.clear(screen.getByLabelText('Vencimiento de la licencia'));

  await submit();

  expect(await screen.findByText('Escribe su nombre completo.')).toBeInTheDocument();
  expect(screen.getByText('Escribe un correo válido.')).toBeInTheDocument();
  expect(screen.getByText('Escribe un teléfono de 8 dígitos.')).toBeInTheDocument();
  expect(
    screen.getByText('Escribe el número de licencia, de 5 a 20 letras y números.'),
  ).toBeInTheDocument();
  expect(screen.getByText('Elige el tipo de licencia.')).toBeInTheDocument();
  expect(screen.getByText('Elige la fecha en que vence la licencia.')).toBeInTheDocument();
  expect(
    screen.getByText('Escribe el salario en quetzales, con hasta dos decimales.'),
  ).toBeInTheDocument();
  expect(save).not.toHaveBeenCalled();
});

it('marks the licence when it is already taken', async () => {
  setup({
    save: jest
      .fn()
      .mockRejectedValue(new ApiError(409, 'Ya existe un chofer con ese número de licencia.')),
  });
  await fillRequired();

  await submit();

  expect(
    await screen.findByText('Ya existe un chofer con ese número de licencia.'),
  ).toHaveAttribute('id', 'driver-license-error');
  expect(screen.getByLabelText('Número de licencia')).toHaveAttribute('aria-invalid', 'true');
  expect(screen.getByLabelText('Número de licencia')).toHaveFocus();
});

it('marks the email when it is already taken', async () => {
  setup({
    save: jest.fn().mockRejectedValue(new ApiError(409, 'Ya existe un chofer con ese correo.')),
  });
  await fillRequired();

  await submit();

  expect(await screen.findByText('Ya existe un chofer con ese correo.')).toHaveAttribute(
    'id',
    'driver-email-error',
  );
  expect(screen.getByLabelText('Correo')).toHaveFocus();
});

it('shows any other failure at the top of the form', async () => {
  setup({
    save: jest
      .fn()
      .mockRejectedValue(new ApiError(409, 'Este chofer tiene viajes programados o en camino.')),
  });
  await fillRequired();

  await submit();

  expect(await screen.findByRole('alert')).toHaveTextContent('tiene viajes programados');
});

it('saves the driver first and then the photo; a failed photo keeps the driver', async () => {
  const upload = jest.fn().mockRejectedValue(new ApiError(400, 'x'));
  const { save, onDone } = setup({
    upload,
    save: jest.fn().mockResolvedValue(driver({ id: 'saved' })),
  });
  await fillRequired();
  const file = new File(['x'], 'julio.png', { type: 'image/png' });
  await user.upload(screen.getByLabelText('Foto del chofer'), file);

  await submit();

  await waitFor(() => expect(onDone).toHaveBeenCalled());
  expect(save).toHaveBeenCalled();
  expect(upload).toHaveBeenCalledWith({ id: 'saved', file });
  expect(toast.error).toHaveBeenCalledWith(
    'Guardamos al chofer, pero no la foto. Intenta subirla de nuevo.',
  );
  expect(toast.success).not.toHaveBeenCalled();
});

it('uploads a good photo and announces the new driver', async () => {
  const { upload } = setup();
  await fillRequired();
  await user.upload(
    screen.getByLabelText('Foto del chofer'),
    new File(['x'], 'j.jpg', { type: 'image/jpeg' }),
  );

  await submit();

  await waitFor(() => expect(toast.success).toHaveBeenCalled());
  expect(upload).toHaveBeenCalled();
});

describe('editing', () => {
  it('starts from the saved driver, with the phone as people read it', async () => {
    const { save } = setup({ existing: driver({ id: 'd-1' }) });

    expect(screen.getByLabelText('Nombre completo')).toHaveValue('Julio Pérez');
    expect(screen.getByLabelText('Teléfono')).toHaveValue('5551-2345');
    expect(screen.getByLabelText('Vencimiento de la licencia')).toHaveValue('2027-03-04');
    await submit();

    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save).toHaveBeenCalledWith({
      id: 'd-1',
      fields: expect.objectContaining({ phone: '55512345', baseSalary: 150, licenseType: 'C' }),
    });
    expect(toast.success).toHaveBeenCalledWith('Guardamos los cambios de Julio Pérez.');
  });
});
