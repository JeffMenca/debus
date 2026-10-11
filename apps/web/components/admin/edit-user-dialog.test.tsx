import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/api/api-error';
import { useUpdateUser } from '../../hooks/use-users';
import { EditUserDialog } from './edit-user-dialog';

jest.mock('../../hooks/use-users');
jest.mock('sonner', () => ({ toast: { success: jest.fn() } }));

const branchId = '9b2c7a10-1111-4c4c-8888-123456789abc';
const otherBranch = '5d1f3a20-2222-4d4d-9999-123456789abc';
const branches = [
  { id: branchId, name: 'Quetzaltenango', active: true },
  { id: otherBranch, name: 'Flores', active: true },
] as never;
const cashier = {
  id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  fullName: 'Ana Sic',
  email: 'ana@correo.com',
  role: 'CASHIER',
  branchId,
  status: 'ACTIVE',
} as const;

function setup(
  user: Parameters<typeof EditUserDialog>[0]['user'] = cashier,
  mutateAsync = jest.fn().mockResolvedValue({}),
) {
  jest.mocked(useUpdateUser).mockReturnValue({ mutateAsync } as never);
  const onOpenChange = jest.fn();
  render(<EditUserDialog user={user} onOpenChange={onOpenChange} branches={branches} />);
  return { mutateAsync, onOpenChange };
}

describe('EditUserDialog', () => {
  it('names the person and starts with their data', () => {
    setup();

    expect(screen.getByRole('dialog', { name: 'Editar a Ana Sic' })).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre completo')).toHaveValue('Ana Sic');
    expect(screen.getByRole('combobox', { name: 'Sucursal' })).toHaveTextContent('Quetzaltenango');
  });

  it('sends only what changed', async () => {
    const { mutateAsync, onOpenChange } = setup();
    const name = screen.getByLabelText('Nombre completo');
    await userEvent.clear(name);
    await userEvent.type(name, 'Ana Sic López');

    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(mutateAsync).toHaveBeenCalledWith({
      id: cashier.id,
      input: { fullName: 'Ana Sic López' },
    });
    expect(jest.requireMock('sonner').toast.success).toHaveBeenCalledWith('Guardamos los cambios.');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('moves the person to another branch', async () => {
    const { mutateAsync } = setup();
    await userEvent.click(screen.getByRole('combobox', { name: 'Sucursal' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Flores' }));

    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(mutateAsync).toHaveBeenCalledWith({ id: cashier.id, input: { branchId: otherBranch } });
  });

  it('just closes when nothing changed', async () => {
    const { mutateAsync, onOpenChange } = setup();

    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(mutateAsync).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('has no branch for roles that do not belong to one', () => {
    setup({ ...cashier, role: 'SYSTEM_ADMIN', branchId: null });

    expect(screen.queryByRole('combobox', { name: 'Sucursal' })).not.toBeInTheDocument();
  });

  it('asks for a name', async () => {
    const { mutateAsync } = setup();
    await userEvent.clear(screen.getByLabelText('Nombre completo'));

    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(await screen.findByText('Escribe su nombre completo.')).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('shows the server message and stays open on a conflict', async () => {
    const { onOpenChange } = setup(
      cashier,
      jest
        .fn()
        .mockRejectedValue(
          new ApiError(409, 'La sucursal debe conservar al menos un administrador.'),
        ),
    );
    await userEvent.type(screen.getByLabelText('Nombre completo'), ' Jr');

    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'La sucursal debe conservar al menos un administrador.',
    );
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('renders nothing without a person', () => {
    setup(null);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
