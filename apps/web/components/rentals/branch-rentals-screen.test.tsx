import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { queryWrapper } from '../../test-support/query-wrapper';
import { mockApi, rental, rentalPage } from '../../test-support/rentals';
import { useOwnBranch } from '../../hooks/use-own-branch';
import { BranchRentalsScreen } from './branch-rentals-screen';

jest.mock('../../hooks/use-own-branch');
jest.mock('sonner', () => ({ toast: { success: jest.fn() } }));
const replace = jest.fn();
let search = '';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/sucursal/alquileres',
  useSearchParams: () => new URLSearchParams(search),
}));

const requested = rental({
  id: 'a1b2c3d4-0000-4000-8000-000000000001',
  clientName: 'Ana Méndez',
  status: 'REQUESTED',
  price: null,
});
const counterConfirmed = rental({
  id: 'a1b2c3d4-0000-4000-8000-000000000002',
  clientName: 'Colegio San José',
  channel: 'COUNTER',
  clientId: null,
  nit: 'CF',
  price: 2600,
});
const paidOnline = rental({
  id: 'a1b2c3d4-0000-4000-8000-000000000003',
  clientName: 'Iglesia Central',
  status: 'PAID',
  paidOn: '2026-10-20',
  paidAt: '2026-10-20T15:00:00.000Z',
});

function api(items = [requested, counterConfirmed, paidOnline]) {
  const sent: { route: string; body?: unknown }[] = [];
  const record = (route: string) => (init: RequestInit) => {
    sent.push({ route, body: init.body ? JSON.parse(String(init.body)) : undefined });
    return Response.json(rental(), { status: 201 });
  };
  mockApi({
    'GET /api/clientes/branch-rentals': () => Response.json(rentalPage(items)),
    [`POST /api/clientes/branch-rentals/${requested.id}/confirm`]: record('confirm'),
    [`POST /api/clientes/rentals/${counterConfirmed.id}/pay`]: record('cash'),
    [`POST /api/clientes/rentals/${requested.id}/cancel`]: record('cancel unpaid'),
    [`POST /api/viajes/rental-requests/${paidOnline.id}/cancel`]: () => {
      sent.push({ route: 'cancel paid' });
      return Response.json(
        {
          id: paidOnline.id,
          branchId: paidOnline.branchId,
          clientName: paidOnline.clientName,
          nit: paidOnline.nit,
          originLabel: paidOnline.originLabel,
          destinationLabel: paidOnline.destinationLabel,
          departureAt: paidOnline.departureAt,
          returnAt: paidOnline.returnAt,
          passengers: paidOnline.passengers,
          distanceKm: paidOnline.distanceKm,
          price: 2500,
          status: 'CANCELLED',
          tripId: null,
        },
        { status: 201 },
      );
    },
  });
  return sent;
}

async function rowOf(name: string) {
  return (await screen.findByText(name)).closest('tr') as HTMLElement;
}

async function act(name: string, action: string) {
  const user = userEvent.setup();
  await user.click(within(await rowOf(name)).getByRole('button', { name: `Acciones de ${name}` }));
  await user.click(await screen.findByRole('menuitem', { name: action }));
  return user;
}

beforeEach(() => {
  search = 'estado=todos';
  replace.mockReset();
  jest.mocked(useOwnBranch).mockReturnValue({ id: 'b', name: 'Xela Centro' } as never);
});
afterEach(() => jest.restoreAllMocks());

const renderScreen = () => render(<BranchRentalsScreen />, { wrapper: queryWrapper().wrapper });

describe('BranchRentalsScreen', () => {
  it('lists the rentals of the branch with what each one waits for', async () => {
    api();
    renderScreen();

    expect(within(await rowOf('Ana Méndez')).getByText('Por confirmar')).toBeInTheDocument();
    expect(within(await rowOf('Colegio San José')).getByText('Esperando pago')).toBeInTheDocument();
    expect(within(await rowOf('Iglesia Central')).getByText('Pagado')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Alquileres' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Registrar alquiler de ventanilla/ })).toHaveAttribute(
      'href',
      '/sucursal/alquileres/ventanilla',
    );
  });

  it('keeps the state and the search in the address', async () => {
    api();
    renderScreen();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('tab', { name: 'Pagados' }));

    expect(replace).toHaveBeenLastCalledWith('/sucursal/alquileres?estado=pagados', {
      scroll: false,
    });
  });

  it('confirms a price with corrected kilometres, the estimate following them', async () => {
    const sent = api();
    renderScreen();
    const user = await act('Ana Méndez', 'Confirmar precio');

    const dialog = await screen.findByRole('dialog');
    await user.clear(within(dialog).getByLabelText('Distancia (km)'));
    await user.type(within(dialog).getByLabelText('Distancia (km)'), '100');
    expect(within(dialog).getByLabelText('Precio')).toHaveValue('3000');
    await user.clear(within(dialog).getByLabelText('Precio'));
    await user.type(within(dialog).getByLabelText('Precio'), '2900');
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar precio' }));

    await waitFor(() =>
      expect(sent).toEqual([{ route: 'confirm', body: { price: 2900, distanceKm: 100 } }]),
    );
  });

  it('refuses a confirmation without a price', async () => {
    const sent = api();
    renderScreen();
    const user = await act('Ana Méndez', 'Confirmar precio');

    const dialog = await screen.findByRole('dialog');
    await user.clear(within(dialog).getByLabelText('Precio'));
    await user.clear(within(dialog).getByLabelText('Distancia (km)'));
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar precio' }));

    expect(within(dialog).getByText('Escribe un precio mayor a Q 0.')).toBeInTheDocument();
    expect(within(dialog).getByText(/Escribe los kilómetros/)).toBeInTheDocument();
    expect(sent).toEqual([]);
  });

  it('takes the cash of a counter rental on the chosen day', async () => {
    const sent = api();
    renderScreen();
    const user = await act('Colegio San José', 'Registrar pago en efectivo');

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Registrar pago' }));

    await waitFor(() => expect(sent.map((s) => s.route)).toEqual(['cash']));
  });

  it('cancels a paid rental in viajes, saying where the money goes', async () => {
    const sent = api();
    renderScreen();
    const user = await act('Iglesia Central', 'Cancelar alquiler');

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/Devolveremos Q\s?2,500\.00 a la cartera/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('checkbox'));
    await user.click(within(dialog).getByRole('button', { name: 'Sí, cancelar alquiler' }));

    await waitFor(() => expect(sent.map((s) => s.route)).toEqual(['cancel paid']));
  });

  it('cancels an unpaid rental in clientes', async () => {
    const sent = api();
    renderScreen();
    const user = await act('Ana Méndez', 'Cancelar alquiler');

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/no hay nada que devolver/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('checkbox'));
    await user.click(within(dialog).getByRole('button', { name: 'Sí, cancelar alquiler' }));

    await waitFor(() => expect(sent.map((s) => s.route)).toEqual(['cancel unpaid']));
  });

  it('says the cash of a paid counter rental goes back at the counter', async () => {
    api([
      { ...counterConfirmed, status: 'PAID', paidOn: '2026-10-20', paidAt: '2026-10-20T15:00:00Z' },
    ]);
    renderScreen();
    await act('Colegio San José', 'Cancelar alquiler');

    expect(
      await screen.findByText(/Devuelve Q\s?2,600\.00 en efectivo en la ventanilla/),
    ).toBeInTheDocument();
  });

  it('tells what each state has when it is empty', async () => {
    search = '';
    api([]);
    renderScreen();

    expect(await screen.findByText('No hay alquileres esperando precio.')).toBeInTheDocument();
  });
});
