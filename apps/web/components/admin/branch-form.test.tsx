import { render, screen } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api/api-error';
import { useCreateBranch, useUpdateBranch } from '../../hooks/use-branches';
import { BranchForm } from './branch-form';

// The typing skips the pauses between events: this long form is not about keystroke timing.
let user: UserEvent;
beforeEach(() => {
  user = userEvent.setup({ delay: null });
});

jest.mock('../../hooks/use-branches');
jest.mock('sonner', () => ({ toast: { success: jest.fn() } }));
const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
jest.mock('./branch-location-picker', () => ({
  BranchLocationPicker: ({
    value,
    onChange,
    error,
  }: {
    value: { latitude: number; longitude: number } | null;
    onChange: (value: { latitude: number; longitude: number }) => void;
    error?: string;
  }) => (
    <div>
      <p>{value ? `pin ${value.latitude},${value.longitude}` : 'sin pin'}</p>
      {error && <p role="alert">{error}</p>}
      <button type="button" onClick={() => onChange({ latitude: 14.8347, longitude: -91.5181 })}>
        Tocar Xela
      </button>
    </div>
  ),
}));

const existing = {
  id: '9b2c7a10-1111-4c4c-8888-123456789abc',
  code: 'XEL',
  name: 'Quetzaltenango',
  department: 'Quetzaltenango',
  municipality: 'Quetzaltenango',
  address: '4a calle 12-30 zona 1',
  phone: '77612233',
  latitude: 14.8347,
  longitude: -91.5181,
  active: true,
  version: 1,
  admins: [],
} as never;

function setup(mode: 'create' | 'edit', mutateAsync = jest.fn().mockResolvedValue({})) {
  jest.mocked(useCreateBranch).mockReturnValue({ mutateAsync } as never);
  jest.mocked(useUpdateBranch).mockReturnValue({ mutateAsync } as never);
  render(
    mode === 'create' ? <BranchForm mode="create" /> : <BranchForm mode="edit" branch={existing} />,
  );
  return { mutateAsync };
}

// Pasting is one event instead of one per key.
async function fill(field: HTMLElement, text: string) {
  await user.click(field);
  await user.paste(text);
}

async function fillCreate() {
  await fill(screen.getByLabelText('Nombre', { exact: true }), 'Cobán');
  await fill(screen.getByLabelText('Código'), 'cob');
  await user.click(screen.getByRole('combobox', { name: 'Departamento' }));
  await user.click(await screen.findByRole('option', { name: 'Alta Verapaz' }));
  await fill(screen.getByLabelText('Municipio'), 'Cobán');
  await fill(screen.getByLabelText('Dirección'), '1a calle 3-10 zona 1');
  await fill(screen.getByLabelText('Teléfono'), '7951-1234');
  await user.click(screen.getByRole('button', { name: 'Tocar Xela' }));
  await fill(screen.getByLabelText('Nombre completo'), 'Carla Xol');
  await fill(screen.getByLabelText('Correo'), 'carla.xol@correo.com');
}

describe('BranchForm (create)', () => {
  beforeEach(() => {
    push.mockReset();
    jest.mocked(toast.success).mockReset();
  });

  it('explains every missing field in Spanish and sends nothing', async () => {
    const { mutateAsync } = setup('create');

    await user.click(screen.getByRole('button', { name: 'Crear sucursal' }));

    for (const message of [
      'Escribe el nombre de la sucursal.',
      'Usa de 3 a 5 letras.',
      'Elige el departamento.',
      'Escribe el municipio.',
      'Escribe la dirección.',
      'Escribe un teléfono de 8 dígitos.',
      'Marca la ubicación en el mapa.',
      'Escribe su nombre completo.',
      'Escribe un correo válido.',
    ]) {
      expect((await screen.findAllByText(message)).length).toBeGreaterThan(0);
    }
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('creates the branch with its first admin, announces it and goes back to the list', async () => {
    const { mutateAsync } = setup('create');
    await fillCreate();

    await user.click(screen.getByRole('button', { name: 'Crear sucursal' }));

    expect(mutateAsync).toHaveBeenCalledWith({
      code: 'COB',
      name: 'Cobán',
      department: 'Alta Verapaz',
      municipality: 'Cobán',
      address: '1a calle 3-10 zona 1',
      phone: '79511234',
      latitude: 14.8347,
      longitude: -91.5181,
      admin: { fullName: 'Carla Xol', email: 'carla.xol@correo.com' },
    });
    expect(toast.success).toHaveBeenCalledWith(
      'Creamos la sucursal Cobán y enviamos la invitación a carla.xol@correo.com.',
    );
    expect(push).toHaveBeenCalledWith('/admin/sucursales');
  });

  it('moves the pin when the coordinates are typed', async () => {
    setup('create');

    await fill(screen.getByLabelText('Latitud'), '14.5');
    await fill(screen.getByLabelText('Longitud'), '-90.5');

    expect(screen.getByText('pin 14.5,-90.5')).toBeInTheDocument();
  });

  it('fills the coordinates when the map is touched', async () => {
    setup('create');

    await user.click(screen.getByRole('button', { name: 'Tocar Xela' }));

    expect(screen.getByLabelText('Latitud')).toHaveValue('14.8347');
    expect(screen.getByLabelText('Longitud')).toHaveValue('-91.5181');
  });

  it('shows a repeated code in the alert and puts the focus on the code', async () => {
    setup(
      'create',
      jest.fn().mockRejectedValue(new ApiError(409, 'Ya existe una sucursal con ese código.')),
    );
    await fillCreate();

    await user.click(screen.getByRole('button', { name: 'Crear sucursal' }));

    expect(await screen.findByText('Ya existe una sucursal con ese código.')).toBeInTheDocument();
    expect(screen.getByLabelText('Código')).toHaveFocus();
    expect(push).not.toHaveBeenCalled();
  });

  it.each([
    ['Ya existe una sucursal con ese nombre.', 'Nombre'],
    ['Ya existe una cuenta con ese correo.', 'Correo'],
  ])('puts the focus on the field of "%s"', async (message, label) => {
    setup('create', jest.fn().mockRejectedValue(new ApiError(409, message)));
    await fillCreate();

    await user.click(screen.getByRole('button', { name: 'Crear sucursal' }));

    await screen.findByText(message);
    expect(screen.getByLabelText(label, { exact: true })).toHaveFocus();
  });

  it('keeps other server errors in the alert without moving the focus', async () => {
    setup('create', jest.fn().mockRejectedValue(new ApiError(0, 'No pudimos conectarnos.')));
    await fillCreate();

    await user.click(screen.getByRole('button', { name: 'Crear sucursal' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos conectarnos.');
  });

  it('offers to cancel back to the list', () => {
    setup('create');

    expect(screen.getByRole('link', { name: 'Cancelar' })).toHaveAttribute(
      'href',
      '/admin/sucursales',
    );
  });
});

describe('BranchForm (edit)', () => {
  beforeEach(() => jest.mocked(toast.success).mockReset());

  it('starts with the branch and has no first administrator', () => {
    setup('edit');

    expect(screen.getByLabelText('Nombre', { exact: true })).toHaveValue('Quetzaltenango');
    expect(screen.getByLabelText('Código')).toHaveValue('XEL');
    expect(screen.getByLabelText('Teléfono')).toHaveValue('7761-2233');
    expect(screen.queryByText('Primer administrador')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeInTheDocument();
  });

  it('sends only the fields that changed', async () => {
    const { mutateAsync } = setup('edit');
    const phone = screen.getByLabelText('Teléfono');
    await user.clear(phone);
    await fill(phone, '7761 0000');

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(mutateAsync).toHaveBeenCalledWith({ phone: '77610000' });
    expect(toast.success).toHaveBeenCalledWith('Guardamos los cambios.');
  });

  it('sends nothing when nothing changed', async () => {
    const { mutateAsync } = setup('edit');

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(mutateAsync).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith('Guardamos los cambios.');
  });
});
