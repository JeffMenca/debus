import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api/api-error';
import { useBranchOptions } from '../../hooks/use-branches';
import {
  useInviteUser,
  useResendInvitation,
  useSetUserActive,
  useUpdateUser,
  useUsersPage,
} from '../../hooks/use-users';
import { UsersScreen } from './users-screen';
import { DEBOUNCE_MS, startFakeClock } from '../../test-support/fake-clock';

jest.mock('../../hooks/use-branches');
jest.mock('../../hooks/use-users');
jest.mock('sonner', () => ({ toast: { success: jest.fn() } }));
const replace = jest.fn();
let search = '';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/admin/usuarios',
  useSearchParams: () => new URLSearchParams(search),
}));

const branchId = '9b2c7a10-1111-4c4c-8888-123456789abc';
const closedBranchId = '3e8a1b30-3333-4e4e-aaaa-123456789abc';
const users = [
  {
    id: 'u1',
    fullName: 'Ana Sic',
    email: 'ana@correo.com',
    role: 'CASHIER',
    branchId,
    branchName: 'Quetzaltenango',
    status: 'ACTIVE',
  },
  {
    id: 'u2',
    fullName: 'José Pérez',
    email: 'jose@correo.com',
    role: 'CASHIER',
    branchId,
    branchName: 'Quetzaltenango',
    status: 'PENDING',
  },
  {
    id: 'u3',
    fullName: 'Luis Ramírez',
    email: 'luis@correo.com',
    role: 'SYSTEM_ADMIN',
    branchId: null,
    branchName: null,
    status: 'INACTIVE',
  },
];
const statusCounts = { ACTIVE: 30, PENDING: 12, INACTIVE: 3 };
const pageOf = (items: unknown[], extra: Record<string, unknown> = {}) => ({
  items,
  total: 45,
  page: 1,
  pageSize: 20,
  summary: { statusCounts },
  ...extra,
});
const manyUsers = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    ...users[0],
    id: `m${index}`,
    fullName: `Persona ${index + 1}`,
    email: `persona${index + 1}@correo.com`,
  }));

function setup({
  error = false,
  items = users,
  page = {},
  address = '',
  refreshing = false,
}: {
  error?: boolean;
  items?: unknown[];
  page?: Record<string, unknown>;
  address?: string;
  refreshing?: boolean;
} = {}) {
  search = address;
  const refetch = jest.fn();
  const resend = jest.fn().mockResolvedValue({ message: 'ok' });
  const setActive = jest.fn().mockResolvedValue(undefined);
  jest.mocked(useUsersPage).mockReturnValue(
    (error
      ? {
          data: undefined,
          isPending: false,
          isError: true,
          isPlaceholderData: false,
          error: new ApiError(0, 'sin red'),
          refetch,
        }
      : {
          data: pageOf(items, page),
          isPending: false,
          isError: false,
          isPlaceholderData: refreshing,
          refetch,
        }) as never,
  );
  jest.mocked(useBranchOptions).mockReturnValue({
    data: [
      { id: branchId, name: 'Quetzaltenango', active: true },
      { id: closedBranchId, name: 'Cobán', active: false },
    ],
  } as never);
  jest.mocked(useInviteUser).mockReturnValue({ mutateAsync: jest.fn() } as never);
  jest.mocked(useUpdateUser).mockReturnValue({ mutateAsync: jest.fn() } as never);
  jest.mocked(useSetUserActive).mockReturnValue({ mutateAsync: setActive } as never);
  jest.mocked(useResendInvitation).mockReturnValue({ mutateAsync: resend } as never);
  render(<UsersScreen />);
  return { refetch, resend, setActive };
}

const lastAddress = () => {
  const [url] = replace.mock.calls.at(-1) as [string];
  const [path, query = ''] = url.split('?');
  return { path, params: new URLSearchParams(query) };
};

const rowOf = (name: RegExp) => screen.getByRole('row', { name });
const openActions = (name: string) =>
  userEvent.click(screen.getByRole('button', { name: `Acciones de ${name}` }));

afterEach(() => {
  jest.useRealTimers();
});

describe('UsersScreen', () => {
  beforeEach(() => {
    jest.mocked(toast.success).mockReset();
    replace.mockReset();
  });

  it('lists the people with role, branch and a plain-language status', () => {
    setup();

    expect(screen.getByRole('heading', { level: 1, name: 'Usuarios' })).toBeInTheDocument();
    expect(rowOf(/Ana Sic/)).toHaveTextContent('Cajero');
    expect(rowOf(/Ana Sic/)).toHaveTextContent('Quetzaltenango');
    expect(rowOf(/Ana Sic/)).toHaveTextContent('Activo');
    expect(rowOf(/José Pérez/)).toHaveTextContent('Invitación enviada');
    expect(rowOf(/Luis Ramírez/)).toHaveTextContent('Inactivo');
    expect(screen.getByText('Mostrando 1–3 de 45')).toBeInTheDocument();
    expect(screen.getByText('Las cuentas no se borran: se desactivan.')).toBeInTheDocument();
  });

  it('shows the 20 people the server sent and says how many pages there are', () => {
    setup({ items: manyUsers(20) });

    expect(
      screen.getByRole('table', { name: 'Usuarios' }).querySelectorAll('tbody tr'),
    ).toHaveLength(20);
    expect(screen.getByText('Página 1 de 3')).toBeInTheDocument();
    expect(screen.getByText('Mostrando 1–20 de 45')).toBeInTheDocument();
  });

  it('asks for the page, size and filters that the address carries', () => {
    setup({ address: 'pagina=2&mostrar=50&estado=pendientes&rol=chofer&buscar=Jos%C3%A9' });

    expect(useUsersPage).toHaveBeenCalledWith({
      page: 2,
      pageSize: 50,
      status: 'PENDING',
      role: 'DRIVER',
      q: 'José',
    });
    expect(screen.getByRole('textbox', { name: 'Buscar usuario' })).toHaveValue('José');
  });

  it('limits the search to what the API accepts', () => {
    setup({ address: `buscar=${'x'.repeat(81)}` });

    expect(screen.getByRole('textbox', { name: 'Buscar usuario' })).toHaveAttribute(
      'maxlength',
      '80',
    );
    expect(screen.getByRole('textbox', { name: 'Buscar usuario' })).toHaveValue('');
  });

  it('moves to another page by writing it in the address', async () => {
    setup({ address: 'pagina=2' });

    await userEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));

    expect(lastAddress().params.get('pagina')).toBe('3');
  });

  it('dims the table while the next page arrives', () => {
    setup({ refreshing: true });

    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('sends the person back to the last page when the one they asked for is empty', () => {
    setup({ items: [], page: { page: 9 }, address: 'pagina=9' });

    expect(lastAddress().params.get('pagina')).toBe('3');
  });

  it('has a single primary button to invite', async () => {
    setup();

    await userEvent.click(screen.getByRole('button', { name: 'Invitar usuario' }));

    expect(screen.getByRole('dialog', { name: 'Invitar usuario' })).toBeInTheDocument();
  });

  it('lets a branch admin be invited to a closed branch', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Invitar usuario' }));
    const invite = within(screen.getByRole('dialog', { name: 'Invitar usuario' }));
    await userEvent.click(invite.getByRole('combobox', { name: 'Rol' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Admin. de sucursal' }));

    await userEvent.click(invite.getByRole('combobox', { name: 'Sucursal' }));

    expect(await screen.findByRole('option', { name: 'Cobán (inactiva)' })).toBeInTheDocument();
  });

  it('names the tabs like the statuses of the rows', () => {
    setup();

    for (const name of [/Todos/, /Activos/, /Invitación enviada/, /Inactivos/]) {
      expect(screen.getByRole('tab', { name })).toBeInTheDocument();
    }
  });

  it('takes the number on each tab from the whole filter, not from the page', () => {
    setup();

    expect(screen.getByRole('tab', { name: /Todos/ })).toHaveTextContent('45');
    expect(screen.getByRole('tab', { name: /Activos/ })).toHaveTextContent('30');
    expect(screen.getByRole('tab', { name: /Invitación enviada/ })).toHaveTextContent('12');
    expect(screen.getByRole('tab', { name: /Inactivos/ })).toHaveTextContent('3');
  });

  it('filters by status tab and goes back to the first page', async () => {
    setup({ address: 'pagina=2' });

    await userEvent.click(screen.getByRole('tab', { name: /Invitación enviada/ }));

    const { path, params } = lastAddress();
    expect(path).toBe('/admin/usuarios');
    expect(params.get('estado')).toBe('pendientes');
    expect(params.has('pagina')).toBe(false);
  });

  it('marks the tab that the address names', () => {
    setup({ address: 'estado=inactivos' });

    expect(screen.getByRole('tab', { name: /Inactivos/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('searches 300 ms after the last key, not on every key', async () => {
    const clock = startFakeClock();
    setup();

    await clock.type(screen.getByRole('textbox', { name: 'Buscar usuario' }), 'jose');
    clock.elapse(DEBOUNCE_MS - 1);
    expect(replace).not.toHaveBeenCalled();

    clock.elapse(1);
    expect(replace).toHaveBeenCalledTimes(1);
    expect(lastAddress().params.get('buscar')).toBe('jose');
  });

  it('says so when no one matches', () => {
    setup({ items: [], page: { total: 0 }, address: 'buscar=zzz' });

    expect(screen.getByText('No hay usuarios con esos filtros.')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Paginación' })).not.toBeInTheDocument();
  });

  it('filters by role', async () => {
    setup();
    await userEvent.click(screen.getByRole('combobox', { name: 'Rol' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Chofer' }));

    expect(lastAddress().params.get('rol')).toBe('chofer');
  });

  it('clears the role filter', async () => {
    setup({ address: 'rol=chofer' });
    await userEvent.click(screen.getByRole('combobox', { name: 'Rol' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Todos los roles' }));

    expect(lastAddress().params.has('rol')).toBe(false);
  });

  it('filters by branch, offering every branch', async () => {
    setup();
    await userEvent.click(screen.getByRole('combobox', { name: 'Sucursal' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Cobán' }));

    expect(lastAddress().params.get('sucursal')).toBe(closedBranchId);
  });

  it('shows no actions on a driver, whose account is managed from the fleet screens', () => {
    setup({
      items: [
        { ...users[1], id: 'u4', fullName: 'Rosa Pop', email: 'rosa@correo.com', role: 'DRIVER' },
      ],
    });

    expect(rowOf(/Rosa Pop/)).toHaveTextContent('Chofer');
    expect(screen.queryByRole('button', { name: 'Acciones de Rosa Pop' })).not.toBeInTheDocument();
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
