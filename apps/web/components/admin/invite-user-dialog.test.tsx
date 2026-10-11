import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/api/api-error';
import { useInviteUser } from '../../hooks/use-users';
import { InviteUserDialog } from './invite-user-dialog';

jest.mock('../../hooks/use-users');
jest.mock('sonner', () => ({ toast: { success: jest.fn() } }));

const branchId = '9b2c7a10-1111-4c4c-8888-123456789abc';
const closedId = '3e8a1b30-3333-4e4e-aaaa-123456789abc';
const branches = [
  { id: branchId, name: 'Quetzaltenango', active: true },
  { id: '5d1f3a20-2222-4d4d-9999-123456789abc', name: 'Flores', active: true },
  { id: closedId, name: 'Cobán', active: false },
] as never;

function setup(mutateAsync = jest.fn().mockResolvedValue({})) {
  jest.mocked(useInviteUser).mockReturnValue({ mutateAsync } as never);
  const onOpenChange = jest.fn();
  render(<InviteUserDialog open onOpenChange={onOpenChange} branches={branches} />);
  return { mutateAsync, onOpenChange };
}

const dialog = () => screen.getByRole('dialog', { name: 'Invitar usuario' });

async function choose(label: string, option: string) {
  await userEvent.click(screen.getByRole('combobox', { name: label }));
  await userEvent.click(await screen.findByRole('option', { name: option }));
}

describe('InviteUserDialog', () => {
  it('asks for a branch to staff that belongs to one', async () => {
    const { mutateAsync } = setup();
    await userEvent.type(screen.getByLabelText('Nombre completo'), 'Ana Sic');
    await userEvent.type(screen.getByLabelText('Correo'), 'ana@correo.com');
    await choose('Rol', 'Cajero');

    await userEvent.click(screen.getByRole('button', { name: 'Enviar invitación' }));

    expect(await screen.findByText('Elige una sucursal.')).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('explains empty or wrong fields in Spanish', async () => {
    const { mutateAsync } = setup();

    await userEvent.click(screen.getByRole('button', { name: 'Enviar invitación' }));

    expect(await screen.findByText('Escribe su nombre completo.')).toBeInTheDocument();
    expect(screen.getByText('Escribe un correo válido.')).toBeInTheDocument();
    expect(screen.getByText('Elige un rol.')).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('hides the branch for roles that do not have one', async () => {
    setup();

    await choose('Rol', 'Cajero');
    expect(screen.getByRole('combobox', { name: 'Sucursal' })).toBeInTheDocument();

    await choose('Rol', 'Admin. del sistema');
    expect(screen.queryByRole('combobox', { name: 'Sucursal' })).not.toBeInTheDocument();
  });

  it('offers a closed branch only to a branch admin, marked as inactive', async () => {
    setup();

    await choose('Rol', 'Cajero');
    await userEvent.click(screen.getByRole('combobox', { name: 'Sucursal' }));
    expect(await screen.findByRole('option', { name: 'Flores' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Cobán/ })).not.toBeInTheDocument();
    await userEvent.keyboard('{Escape}');

    await choose('Rol', 'Admin. de sucursal');
    await userEvent.click(screen.getByRole('combobox', { name: 'Sucursal' }));
    expect(await screen.findByRole('option', { name: 'Cobán (inactiva)' })).toBeInTheDocument();
  });

  it('invites a branch admin to a closed branch', async () => {
    const { mutateAsync } = setup();
    await userEvent.type(screen.getByLabelText('Nombre completo'), 'Ana Sic');
    await userEvent.type(screen.getByLabelText('Correo'), 'ana@correo.com');
    await choose('Rol', 'Admin. de sucursal');
    await choose('Sucursal', 'Cobán (inactiva)');

    await userEvent.click(screen.getByRole('button', { name: 'Enviar invitación' }));

    expect(mutateAsync).toHaveBeenCalledWith({
      fullName: 'Ana Sic',
      email: 'ana@correo.com',
      role: 'BRANCH_ADMIN',
      branchId: closedId,
    });
  });

  it('drops a closed branch when the role changes to one that cannot take it', async () => {
    const { mutateAsync } = setup();
    await userEvent.type(screen.getByLabelText('Nombre completo'), 'Ana Sic');
    await userEvent.type(screen.getByLabelText('Correo'), 'ana@correo.com');
    await choose('Rol', 'Admin. de sucursal');
    await choose('Sucursal', 'Cobán (inactiva)');
    await choose('Rol', 'Cajero');

    await userEvent.click(screen.getByRole('button', { name: 'Enviar invitación' }));

    expect(await screen.findByText('Elige una sucursal.')).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('does not offer clients, who register on their own', async () => {
    setup();

    await userEvent.click(screen.getByRole('combobox', { name: 'Rol' }));

    expect(await screen.findByRole('option', { name: 'Chofer' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Cliente' })).not.toBeInTheDocument();
  });

  it('sends the invitation, announces it and closes', async () => {
    const { mutateAsync, onOpenChange } = setup();
    await userEvent.type(screen.getByLabelText('Nombre completo'), 'Ana Sic');
    await userEvent.type(screen.getByLabelText('Correo'), ' Ana@Correo.com ');
    await choose('Rol', 'Cajero');
    await choose('Sucursal', 'Quetzaltenango');

    await userEvent.click(screen.getByRole('button', { name: 'Enviar invitación' }));

    expect(mutateAsync).toHaveBeenCalledWith({
      fullName: 'Ana Sic',
      email: 'ana@correo.com',
      role: 'CASHIER',
      branchId,
    });
    const { toast } = jest.requireMock('sonner');
    expect(toast.success).toHaveBeenCalledWith(
      'Le enviamos un correo a ana@correo.com para que cree su contraseña.',
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows the server message and stays open when the email already exists', async () => {
    const { onOpenChange } = setup(
      jest.fn().mockRejectedValue(new ApiError(409, 'Ya existe una cuenta con ese correo.')),
    );
    await userEvent.type(screen.getByLabelText('Nombre completo'), 'Ana Sic');
    await userEvent.type(screen.getByLabelText('Correo'), 'ana@correo.com');
    await choose('Rol', 'Admin. del sistema');

    await userEvent.click(screen.getByRole('button', { name: 'Enviar invitación' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ya existe una cuenta con ese correo.',
    );
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(dialog()).toBeInTheDocument();
  });
});
