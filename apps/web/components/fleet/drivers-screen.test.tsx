import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api/api-error';
import { driver, driverPage } from '../../test-support/fleet';
import {
  useDriversPage,
  useSaveDriver,
  useSetDriverActive,
  useUploadDriverPhoto,
} from '../../hooks/use-drivers';
import { useOwnBranch } from '../../hooks/use-own-branch';
import { DriverSheet } from './driver-sheet';
import { DriversScreen } from './drivers-screen';
import { DEBOUNCE_MS, startFakeClock } from '../../test-support/fake-clock';

jest.mock('@debus/contracts', () => ({
  ...jest.requireActual('@debus/contracts'),
  todayInGuatemala: () => '2026-10-12',
}));
jest.mock('../../hooks/use-drivers');
jest.mock('../../hooks/use-own-branch');
jest.mock('../../hooks/use-photo', () => ({ usePhoto: () => null }));
jest.mock('./driver-sheet', () => ({
  DriverSheet: jest.fn(jest.requireActual('./driver-sheet').DriverSheet),
}));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
const replace = jest.fn();
let search = '';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/sucursal/choferes',
  useSearchParams: () => new URLSearchParams(search),
}));

const drivers = [
  driver({ id: 'd1', assignedBusPlate: 'C482BTX', licenseExpiresOn: '2026-10-15' }),
  driver({
    id: 'd2',
    fullName: 'Ana Sic',
    email: 'ana@correo.com',
    licenseNumber: 'B7654321',
    licenseType: 'B',
    licenseExpiresOn: '2027-06-01',
    phone: '55598765',
  }),
  driver({ id: 'd3', fullName: 'Marta Coyoy', active: false, licenseExpiresOn: '2026-10-01' }),
];

function setup({
  error = false,
  items = drivers,
  address = '',
  total = items.length,
  setActive = jest.fn().mockResolvedValue(undefined),
}: {
  error?: boolean;
  items?: unknown[];
  address?: string;
  total?: number;
  setActive?: jest.Mock;
} = {}) {
  search = address;
  const refetch = jest.fn();
  jest.mocked(useDriversPage).mockReturnValue(
    (error
      ? { data: undefined, isPending: false, isError: true, isPlaceholderData: false, refetch }
      : {
          data: driverPage(items as never, { total }),
          isPending: false,
          isError: false,
          isPlaceholderData: false,
          refetch,
        }) as never,
  );
  jest.mocked(useSaveDriver).mockReturnValue({ mutateAsync: jest.fn() } as never);
  jest.mocked(useUploadDriverPhoto).mockReturnValue({ mutateAsync: jest.fn() } as never);
  jest.mocked(useSetDriverActive).mockReturnValue({ mutateAsync: setActive } as never);
  jest.mocked(useOwnBranch).mockReturnValue({ id: 'br', name: 'Quetzaltenango' } as never);
  render(<DriversScreen />);
  return { refetch, setActive };
}

const lastAddress = () => {
  const [url] = replace.mock.calls.at(-1) as [string];
  const [path, query = ''] = url.split('?');
  return { path, params: new URLSearchParams(query) };
};
const openActions = (name: string) =>
  userEvent.click(screen.getByRole('button', { name: `Acciones de ${name}` }));

beforeEach(() => {
  replace.mockReset();
  jest.mocked(toast.success).mockReset();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('DriversScreen', () => {
  it('names the branch and has a single primary action', () => {
    setup();

    expect(screen.getByText('Flota · Quetzaltenango')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Choferes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registrar chofer' })).toBeInTheDocument();
  });

  it('lists each driver with licence, expiry, phone, bus and state', () => {
    setup();

    const julio = screen.getByRole('row', { name: /Julio Pérez/ });
    expect(julio).toHaveTextContent('julio@correo.com');
    expect(julio).toHaveTextContent('A1234567');
    expect(julio).toHaveTextContent('Tipo C');
    expect(julio).toHaveTextContent('Vence en 3 días');
    expect(julio).toHaveTextContent('5551-2345');
    expect(julio).toHaveTextContent('C-482BTX');
    expect(julio).toHaveTextContent('12');
    expect(julio).toHaveTextContent('Activo');
    expect(screen.getByRole('row', { name: /Ana Sic/ })).toHaveTextContent('Sin bus');
    expect(screen.getByRole('row', { name: /Ana Sic/ })).toHaveTextContent('Vence el 1 jun 2027');
    expect(screen.getByRole('row', { name: /Marta Coyoy/ })).toHaveTextContent('Inactivo');
    expect(screen.getByRole('row', { name: /Marta Coyoy/ })).toHaveTextContent(
      'Venció hace 11 días',
    );
  });

  it('highlights the licences that are about to expire', () => {
    setup();

    expect(screen.getByText('Vence en 3 días')).toHaveClass('bg-coral-100');
  });

  it('starts on the active tab with the counts of the whole filter', () => {
    setup();

    expect(useDriversPage).toHaveBeenCalledWith({ status: 'active', page: 1, pageSize: 20 });
    expect(screen.getByRole('tab', { name: /Activos/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /Activos/ })).toHaveTextContent('5');
    expect(screen.getByRole('tab', { name: /Inactivos/ })).toHaveTextContent('2');
    expect(screen.getByRole('tab', { name: /Todos/ })).toHaveTextContent('7');
  });

  it('asks for what the address carries', () => {
    setup({ address: 'estado=todos&buscar=ana&pagina=2&mostrar=50' });

    expect(useDriversPage).toHaveBeenCalledWith({ status: 'all', q: 'ana', page: 2, pageSize: 50 });
    expect(screen.getByRole('textbox', { name: 'Buscar chofer' })).toHaveValue('ana');
  });

  it('changes the tab in the address and goes back to the first page', async () => {
    setup({ address: 'pagina=2' });

    await userEvent.click(screen.getByRole('tab', { name: /Inactivos/ }));

    const { path, params } = lastAddress();
    expect(path).toBe('/sucursal/choferes');
    expect(params.get('estado')).toBe('inactivos');
    expect(params.has('pagina')).toBe(false);
  });

  it('searches 300 ms after the last key and says what the box is for', async () => {
    const clock = startFakeClock();
    setup();
    const box = screen.getByRole('textbox', { name: 'Buscar chofer' });
    expect(box).toHaveAttribute('placeholder', 'Buscar nombre, licencia o correo');

    await clock.type(box, 'ana');
    clock.elapse(DEBOUNCE_MS - 1);
    expect(replace).not.toHaveBeenCalled();

    clock.elapse(1);
    expect(replace).toHaveBeenCalledTimes(1);
    expect(lastAddress().params.get('buscar')).toBe('ana');
  });

  it('pages in the address', async () => {
    setup({ total: 45, address: 'pagina=2' });

    await userEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));

    expect(lastAddress().params.get('pagina')).toBe('3');
  });

  it('says so when there are no drivers and when a filter finds none', () => {
    setup({ items: [], total: 0 });
    expect(
      screen.getByText('Aún no hay choferes. Registra el primero con «Registrar chofer».'),
    ).toBeInTheDocument();
  });

  it('says so when a filter finds none', () => {
    setup({ items: [], total: 0, address: 'estado=inactivos' });

    expect(screen.getByText('No hay choferes con esos filtros.')).toBeInTheDocument();
  });

  it('shows a friendly error with a retry', async () => {
    const { refetch } = setup({ error: true });

    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar los choferes.');
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(refetch).toHaveBeenCalled();
  });

  it('asks before deactivating and then does it', async () => {
    const { setActive } = setup();

    await openActions('Ana Sic');
    await userEvent.click(screen.getByRole('menuitem', { name: 'Desactivar' }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('¿Desactivar a Ana Sic?');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Desactivar' }));

    await waitFor(() => expect(setActive).toHaveBeenCalledWith({ id: 'd2', active: false }));
    expect(toast.success).toHaveBeenCalledWith('Desactivamos a Ana Sic.');
  });

  it('shows the reason in the dialog when the driver has trips', async () => {
    setup({
      setActive: jest
        .fn()
        .mockRejectedValue(new ApiError(409, 'Este chofer tiene viajes programados o en camino.')),
    });

    await openActions('Ana Sic');
    await userEvent.click(screen.getByRole('menuitem', { name: 'Desactivar' }));
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Desactivar' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('tiene viajes programados');
  });

  it('reactivates an inactive driver after confirming', async () => {
    const { setActive } = setup();

    await openActions('Marta Coyoy');
    expect(screen.queryByRole('menuitem', { name: 'Desactivar' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Reactivar' }));
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Reactivar' }),
    );

    await waitFor(() => expect(setActive).toHaveBeenCalledWith({ id: 'd3', active: true }));
    expect(toast.success).toHaveBeenCalledWith('Reactivamos a Marta Coyoy.');
  });

  it('opens the form from the primary action and from Editar', async () => {
    setup();

    await userEvent.click(screen.getByRole('button', { name: 'Registrar chofer' }));
    expect(screen.getByRole('dialog', { name: 'Registrar chofer' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await openActions('Julio Pérez');
    await userEvent.click(screen.getByRole('menuitem', { name: 'Editar' }));
    expect(screen.getByRole('dialog', { name: 'Editar a Julio Pérez' })).toBeInTheDocument();
  });

  it('keeps the edited driver in the panel while it closes', async () => {
    setup();
    await openActions('Julio Pérez');
    await userEvent.click(screen.getByRole('menuitem', { name: 'Editar' }));

    await userEvent.keyboard('{Escape}');

    // The panel animates out after `open` flips, so it must still hold the driver it was editing.
    expect(jest.mocked(DriverSheet).mock.lastCall?.[0]).toMatchObject({
      open: false,
      driver: { fullName: 'Julio Pérez' },
    });
  });
});
