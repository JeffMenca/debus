import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api/api-error';
import { useBranchesPage, useSetBranchActive } from '../../hooks/use-branches';
import { BranchesScreen } from './branches-screen';
import { DEBOUNCE_MS, startFakeClock } from '../../test-support/fake-clock';

jest.mock('../../hooks/use-branches');
jest.mock('sonner', () => ({ toast: { success: jest.fn() } }));
const push = jest.fn();
const replace = jest.fn();
let search = '';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => '/admin/sucursales',
  useSearchParams: () => new URLSearchParams(search),
}));

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

const statusCounts = { active: 22, inactive: 3 };

function setup({
  error = false,
  data = branches,
  total = data.length,
  page = 1,
  address = '',
  refreshing = false,
}: {
  error?: boolean;
  data?: unknown[];
  total?: number;
  page?: number;
  address?: string;
  refreshing?: boolean;
} = {}) {
  search = address;
  const refetch = jest.fn();
  const setActive = jest.fn().mockResolvedValue(undefined);
  jest.mocked(useBranchesPage).mockReturnValue(
    (error
      ? {
          data: undefined,
          isPending: false,
          isError: true,
          isPlaceholderData: false,
          error: new ApiError(0, 'x'),
          refetch,
        }
      : {
          data: { items: data, total, page, pageSize: 20, summary: { statusCounts } },
          isPending: false,
          isError: false,
          isPlaceholderData: refreshing,
          refetch,
        }) as never,
  );
  jest.mocked(useSetBranchActive).mockReturnValue({ mutateAsync: setActive } as never);
  render(<BranchesScreen />);
  return { refetch, setActive };
}

const lastAddress = () => {
  const [url] = replace.mock.calls.at(-1) as [string];
  const [path, query = ''] = url.split('?');
  return { path, params: new URLSearchParams(query) };
};

const openActions = (name: string) =>
  userEvent.click(screen.getByRole('button', { name: `Acciones de ${name}` }));

afterEach(() => {
  jest.useRealTimers();
});

describe('BranchesScreen', () => {
  beforeEach(() => {
    push.mockReset();
    replace.mockReset();
    jest.mocked(toast.success).mockReset();
  });

  it('starts on the active tab and takes the numbers of the tabs from the whole filter', () => {
    setup();

    expect(useBranchesPage).toHaveBeenCalledWith({ status: 'active', page: 1, pageSize: 20 });
    expect(screen.getByRole('tab', { name: /Activas/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /Activas/ })).toHaveTextContent('22');
    expect(screen.getByRole('tab', { name: /Inactivas/ })).toHaveTextContent('3');
    expect(screen.getByRole('tab', { name: /Todas/ })).toHaveTextContent('25');
    expect(screen.getByText('Mostrando 1–3 de 3')).toBeInTheDocument();
  });

  it('asks for what the address carries', () => {
    setup({ address: 'estado=todas&buscar=Pet%C3%A9n&pagina=2&mostrar=50' });

    expect(useBranchesPage).toHaveBeenCalledWith({
      status: 'all',
      q: 'Petén',
      page: 2,
      pageSize: 50,
    });
    expect(screen.getByRole('tab', { name: /Todas/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('textbox', { name: 'Buscar sucursal' })).toHaveValue('Petén');
  });

  it('limits the search to what the API accepts', () => {
    setup({ address: `buscar=${'x'.repeat(81)}` });

    expect(screen.getByRole('textbox', { name: 'Buscar sucursal' })).toHaveAttribute(
      'maxlength',
      '80',
    );
    expect(screen.getByRole('textbox', { name: 'Buscar sucursal' })).toHaveValue('');
  });

  it('pages the list and keeps the table on screen, dimmed, while the next page arrives', async () => {
    setup({ data: branches, total: 45, address: 'estado=todas&pagina=2', refreshing: true });

    expect(screen.getByText('Página 2 de 3')).toBeInTheDocument();
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));

    const { params } = lastAddress();
    expect(params.get('pagina')).toBe('3');
    expect(params.get('estado')).toBe('todas');
  });

  it('sends the person back to the last page when the one they asked for is empty', () => {
    setup({ data: [], total: 45, page: 9, address: 'pagina=9' });

    expect(lastAddress().params.get('pagina')).toBe('3');
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

  it('changes the tab by writing it in the address and goes back to the first page', async () => {
    setup({ address: 'pagina=2' });

    await userEvent.click(screen.getByRole('tab', { name: /Inactivas/ }));

    const { path, params } = lastAddress();
    expect(path).toBe('/admin/sucursales');
    expect(params.get('estado')).toBe('inactivas');
    expect(params.has('pagina')).toBe(false);
  });

  it('keeps the active tab out of the address', async () => {
    setup({ address: 'estado=todas' });

    await userEvent.click(screen.getByRole('tab', { name: /Activas/ }));

    expect(lastAddress().params.has('estado')).toBe(false);
  });

  it('flags a branch without admin and says Inactiva', () => {
    setup({ data: [branches[2]], address: 'estado=inactivas' });

    const row = screen.getByRole('row', { name: /Escuintla/ });
    expect(row).toHaveTextContent('Inactiva');
    expect(row).toHaveTextContent('Sin administrador');
  });

  it('does not count deactivated admins: only the current ones show, or none at all', () => {
    const gone = { id: 'a9', fullName: 'Rosa Baja', email: 'r@c.com', status: 'INACTIVE' };
    setup({
      data: [
        branch({ id: 'b1', name: 'Cobán', code: 'COB', admins: [gone] }),
        branch({
          id: 'b2',
          name: 'Flores',
          code: 'FLO',
          admins: [gone, { id: 'a2', fullName: 'Carla Xol', email: 'c@c.com', status: 'ACTIVE' }],
        }),
      ],
    });

    expect(screen.getByRole('row', { name: /Cobán/ })).toHaveTextContent('Sin administrador');
    expect(screen.getByRole('row', { name: /Cobán/ })).not.toHaveTextContent('Rosa Baja');
    expect(screen.getByRole('row', { name: /Flores/ })).toHaveTextContent('Carla Xol');
    expect(screen.getByRole('row', { name: /Flores/ })).not.toHaveTextContent('Rosa Baja');
  });

  it('searches 300 ms after the last key, not on every key', async () => {
    const clock = startFakeClock();
    setup();

    await clock.type(screen.getByRole('textbox', { name: 'Buscar sucursal' }), 'peten');
    clock.elapse(DEBOUNCE_MS - 1);
    expect(replace).not.toHaveBeenCalled();

    clock.elapse(1);
    expect(replace).toHaveBeenCalledTimes(1);
    expect(lastAddress().params.get('buscar')).toBe('peten');
  });

  it('invites to create the first branch when there are none at all', () => {
    setup({ data: [], total: 0 });

    expect(
      screen.getByText('Aún no hay sucursales. Crea la primera con «Nueva sucursal».'),
    ).toBeInTheDocument();
  });

  it.each([
    ['a search', 'buscar=zzz'],
    ['another tab', 'estado=inactivas'],
  ])('says nothing matches when %s leaves no branch', (_, address) => {
    setup({ data: [], total: 0, address });

    expect(screen.getByText('No hay sucursales con esos filtros.')).toBeInTheDocument();
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
    const { setActive } = setup({ data: [branches[2]], address: 'estado=inactivas' });

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
