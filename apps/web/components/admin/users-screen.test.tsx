import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api/api-error';
import { useBranches } from '../../hooks/use-branches';
import {
  useInviteUser,
  useResendInvitation,
  useSetUserActive,
  useUpdateUser,
  useUsers,
} from '../../hooks/use-users';
import { UsersScreen } from './users-screen';

jest.mock('../../hooks/use-branches');
jest.mock('../../hooks/use-users');
jest.mock('sonner', () => ({ toast: { success: jest.fn() } }));

const branchId = '9b2c7a10-1111-4c4c-8888-123456789abc';
const users = [
  {
    id: 'u1',
    fullName: 'Ana Sic',
    email: 'ana@correo.com',
    role: 'CASHIER',
    branchId,
    status: 'ACTIVE',
  },
  {
    id: 'u2',
    fullName: 'José Pérez',
    email: 'jose@correo.com',
    role: 'DRIVER',
    branchId,
    status: 'PENDING',
  },
  {
    id: 'u3',
    fullName: 'Luis Ramírez',
    email: 'luis@correo.com',
    role: 'SYSTEM_ADMIN',
    branchId: null,
    status: 'INACTIVE',
  },
];

function setup({ error = false }: { error?: boolean } = {}) {
  const refetch = jest.fn();
  const resend = jest.fn().mockResolvedValue({ message: 'ok' });
  const setActive = jest.fn().mockResolvedValue(undefined);
  jest.mocked(useUsers).mockReturnValue(
    (error
      ? {
          data: undefined,
          isPending: false,
          isError: true,
          error: new ApiError(0, 'sin red'),
          refetch,
        }
      : { data: users, isPending: false, isError: false, refetch }) as never,
  );
  jest
    .mocked(useBranches)
    .mockReturnValue({ data: [{ id: branchId, name: 'Quetzaltenango', active: true }] } as never);
  jest.mocked(useInviteUser).mockReturnValue({ mutateAsync: jest.fn() } as never);
  jest.mocked(useUpdateUser).mockReturnValue({ mutateAsync: jest.fn() } as never);
  jest.mocked(useSetUserActive).mockReturnValue({ mutateAsync: setActive } as never);
  jest.mocked(useResendInvitation).mockReturnValue({ mutateAsync: resend } as never);
  render(<UsersScreen />);
  return { refetch, resend, setActive };
}

const rowOf = (name: RegExp) => screen.getByRole('row', { name });
const openActions = (name: string) =>
  userEvent.click(screen.getByRole('button', { name: `Acciones de ${name}` }));

describe('UsersScreen', () => {
  beforeEach(() => jest.mocked(toast.success).mockReset());

  it('lists the people with role, branch and a plain-language status', () => {
    setup();

    expect(screen.getByRole('heading', { level: 1, name: 'Usuarios' })).toBeInTheDocument();
    expect(rowOf(/Ana Sic/)).toHaveTextContent('Cajero');
    expect(rowOf(/Ana Sic/)).toHaveTextContent('Quetzaltenango');
    expect(rowOf(/Ana Sic/)).toHaveTextContent('Activo');
    expect(rowOf(/José Pérez/)).toHaveTextContent('Invitación enviada');
    expect(rowOf(/Luis Ramírez/)).toHaveTextContent('Inactivo');
    expect(screen.getByText('Mostrando 3 de 3 usuarios')).toBeInTheDocument();
    expect(screen.getByText('Las cuentas no se borran: se desactivan.')).toBeInTheDocument();
  });

  it('has a single primary button to invite', async () => {
    setup();

    await userEvent.click(screen.getByRole('button', { name: 'Invitar usuario' }));

    expect(screen.getByRole('dialog', { name: 'Invitar usuario' })).toBeInTheDocument();
  });

  it('filters by status tab and by search', async () => {
    setup();

    await userEvent.click(screen.getByRole('tab', { name: /Invitación enviada/ }));
    expect(screen.queryByRole('row', { name: /Ana Sic/ })).not.toBeInTheDocument();
    expect(rowOf(/José Pérez/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: /Todas/ }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Buscar usuario' }), 'jose');
    expect(screen.queryByRole('row', { name: /Ana Sic/ })).not.toBeInTheDocument();
    expect(screen.getByText('Mostrando 1 de 3 usuarios')).toBeInTheDocument();
  });

  it('says so when no one matches', async () => {
    setup();

    await userEvent.type(screen.getByRole('textbox', { name: 'Buscar usuario' }), 'zzz');

    expect(screen.getByText('No hay usuarios con esos filtros.')).toBeInTheDocument();
  });

  it('filters by role', async () => {
    setup();
    await userEvent.click(screen.getByRole('combobox', { name: 'Rol' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Chofer' }));

    expect(screen.queryByRole('row', { name: /Ana Sic/ })).not.toBeInTheDocument();
    expect(rowOf(/José Pérez/)).toBeInTheDocument();
  });

  it('resends the invitation only to pending accounts', async () => {
    const { resend } = setup();

    await openActions('Ana Sic');
    expect(screen.queryByRole('menuitem', { name: 'Reenviar invitación' })).not.toBeInTheDocument();
    await userEvent.keyboard('{Escape}');

    await openActions('José Pérez');
    await userEvent.click(screen.getByRole('menuitem', { name: 'Reenviar invitación' }));

    expect(resend).toHaveBeenCalledWith('u2');
    expect(toast.success).toHaveBeenCalledWith(
      'Enviamos de nuevo la invitación a jose@correo.com.',
    );
  });

  it('asks before deactivating and then does it', async () => {
    const { setActive } = setup();

    await openActions('Ana Sic');
    await userEvent.click(screen.getByRole('menuitem', { name: 'Desactivar' }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('¿Desactivar a Ana Sic?');
    expect(dialog).toHaveTextContent(
      'No podrá iniciar sesión. Puedes reactivar su cuenta cuando quieras.',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Desactivar' }));

    expect(setActive).toHaveBeenCalledWith({ id: 'u1', active: false });
  });

  it('reactivates inactive accounts after confirming', async () => {
    const { setActive } = setup();

    await openActions('Luis Ramírez');
    expect(screen.queryByRole('menuitem', { name: 'Desactivar' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Reactivar' }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('¿Reactivar a Luis Ramírez?');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reactivar' }));

    expect(setActive).toHaveBeenCalledWith({ id: 'u3', active: true });
  });

  it('opens the editor with the person selected', async () => {
    setup();

    await openActions('Ana Sic');
    await userEvent.click(screen.getByRole('menuitem', { name: 'Editar' }));

    expect(screen.getByRole('dialog', { name: 'Editar a Ana Sic' })).toBeInTheDocument();
  });

  it('shows a friendly error with a retry', async () => {
    const { refetch } = setup({ error: true });

    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar los usuarios.');
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(refetch).toHaveBeenCalled();
  });
});
