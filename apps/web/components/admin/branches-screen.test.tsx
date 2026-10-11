import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api/api-error';
import { useBranches, useSetBranchActive } from '../../hooks/use-branches';
import { BranchesScreen } from './branches-screen';

jest.mock('../../hooks/use-branches');
jest.mock('sonner', () => ({ toast: { success: jest.fn() } }));
const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const branch = (over: Record<string, unknown>) => ({
  id: 'b',
  code: 'XEL',
  name: 'Quetzaltenango',
  department: 'Quetzaltenango',
  municipality: 'Quetzaltenango',
  address: 'Calle 1',
  phone: '77612233',
  latitude: 14.8,
  longitude: -91.5,
  active: true,
  version: 1,
  admins: [{ id: 'a1', fullName: 'Luis Ramírez', email: 'l@c.com', status: 'ACTIVE' }],
  ...over,
});
const branches = [
  branch({ id: 'b1' }),
  branch({
    id: 'b2',
    code: 'FLO',
    name: 'Flores',
    department: 'Petén',
    municipality: 'Flores',
    phone: '79511234',
    admins: [{ id: 'a2', fullName: 'Carla Xol', email: 'c@c.com', status: 'PENDING' }],
  }),
  branch({
    id: 'b3',
    code: 'ESC',
    name: 'Escuintla',
    department: 'Escuintla',
    municipality: 'Escuintla',
    active: false,
    admins: [],
  }),
];

function setup({ error = false }: { error?: boolean } = {}) {
  const refetch = jest.fn();
  const setActive = jest.fn().mockResolvedValue(undefined);
  jest
    .mocked(useBranches)
    .mockReturnValue(
      (error
        ? { data: undefined, isPending: false, isError: true, error: new ApiError(0, 'x'), refetch }
        : { data: branches, isPending: false, isError: false, refetch }) as never,
    );
  jest.mocked(useSetBranchActive).mockReturnValue({ mutateAsync: setActive } as never);
  render(<BranchesScreen />);
  return { refetch, setActive };
}

const openActions = (name: string) =>
  userEvent.click(screen.getByRole('button', { name: `Acciones de ${name}` }));

describe('BranchesScreen', () => {
  beforeEach(() => {
    push.mockReset();
    jest.mocked(toast.success).mockReset();
  });

  it('asks for every branch, including the inactive ones, and starts on the active tab', () => {
    setup();

    expect(useBranches).toHaveBeenCalledWith({ includeInactive: true });
    expect(screen.getByRole('tab', { name: /Activas/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /Activas/ })).toHaveTextContent('2');
    expect(screen.getByRole('tab', { name: /Inactivas/ })).toHaveTextContent('1');
    expect(screen.getByRole('tab', { name: /Todas/ })).toHaveTextContent('3');
    expect(screen.queryByRole('row', { name: /Escuintla/ })).not.toBeInTheDocument();
    expect(screen.getByText('Mostrando 2 de 3 sucursales')).toBeInTheDocument();
  });

  it('shows location, phone, admins and status in plain language', () => {
    setup();

    const xela = screen.getByRole('row', { name: /Quetzaltenango/ });
    expect(xela).toHaveTextContent('XEL');
    expect(xela).toHaveTextContent('Quetzaltenango, Quetzaltenango');
    expect(xela).toHaveTextContent('7761-2233');
    expect(xela).toHaveTextContent('Luis Ramírez');
    expect(xela).toHaveTextContent('Activa');
    expect(screen.getByRole('row', { name: /Flores/ })).toHaveTextContent(
      'Carla Xol (invitación enviada)',
    );
  });

  it('has the single primary action to create one', () => {
    setup();

    expect(screen.getByRole('link', { name: 'Nueva sucursal' })).toHaveAttribute(
      'href',
      '/admin/sucursales/nueva',
    );
  });

  it('shows the inactive ones on their tab, flags a branch without admin and says Inactiva', async () => {
    setup();

    await userEvent.click(screen.getByRole('tab', { name: /Inactivas/ }));

    const row = screen.getByRole('row', { name: /Escuintla/ });
    expect(row).toHaveTextContent('Inactiva');
    expect(row).toHaveTextContent('Sin administrador');
    expect(screen.queryByRole('row', { name: /Flores/ })).not.toBeInTheDocument();
  });

  it('searches by code, place and without accents', async () => {
    setup();
    await userEvent.click(screen.getByRole('tab', { name: /Todas/ }));

    await userEvent.type(screen.getByRole('textbox', { name: 'Buscar sucursal' }), 'peten');

    expect(screen.getByRole('row', { name: /Flores/ })).toBeInTheDocument();
    expect(screen.queryByRole('row', { name: /Quetzaltenango/ })).not.toBeInTheDocument();
  });

  it('says so when nothing matches', async () => {
    setup();

    await userEvent.type(screen.getByRole('textbox', { name: 'Buscar sucursal' }), 'zzz');

    expect(
      screen.getByText('Aún no hay sucursales. Crea la primera con «Nueva sucursal».'),
    ).toBeInTheDocument();
  });

  it('opens the editor of the branch', async () => {
    setup();

    await openActions('Flores');
    await userEvent.click(screen.getByRole('menuitem', { name: 'Editar' }));

    expect(push).toHaveBeenCalledWith('/admin/sucursales/b2');
  });

  it('asks before deactivating and then does it', async () => {
    const { setActive } = setup();

    await openActions('Flores');
    await userEvent.click(screen.getByRole('menuitem', { name: 'Desactivar' }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('¿Desactivar Flores?');
    expect(dialog).toHaveTextContent(
      'Dejará de aparecer para crear personal, buses y rutas. Su historial se conserva.',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Desactivar' }));

    expect(setActive).toHaveBeenCalledWith({ id: 'b2', active: false });
    expect(toast.success).toHaveBeenCalledWith('Desactivamos la sucursal Flores.');
  });

  it('reactivates an inactive branch after confirming', async () => {
    const { setActive } = setup();
    await userEvent.click(screen.getByRole('tab', { name: /Inactivas/ }));

    await openActions('Escuintla');
    expect(screen.queryByRole('menuitem', { name: 'Desactivar' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Reactivar' }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('¿Reactivar Escuintla?');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reactivar' }));

    expect(setActive).toHaveBeenCalledWith({ id: 'b3', active: true });
    expect(toast.success).toHaveBeenCalledWith('Reactivamos la sucursal Escuintla.');
  });

  it('shows a friendly error with a retry', async () => {
    const { refetch } = setup({ error: true });

    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar las sucursales.');
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(refetch).toHaveBeenCalled();
  });
});
