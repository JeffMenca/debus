import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { clearSession, setSession } from '@/lib/auth/session-store';
import { useOwnBranch } from '../../hooks/use-own-branch';
import { queryWrapper } from '../../test-support/query-wrapper';
import { BRANCH_ID, mockApi, rental } from '../../test-support/rentals';
import { CounterRentalScreen } from './counter-rental-screen';

jest.mock('../../hooks/use-own-branch');
jest.mock('sonner', () => ({ toast: { success: jest.fn() } }));
const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const CLIENT_ID = '7d6c5b4a-3f2e-4d1c-8b0a-9f8e7d6c5b4a';
const ANA = { userId: CLIENT_ID, fullName: 'Ana Méndez', email: 'ana@correo.com', nit: '45218376' };
const place = (department: string) => ({
  id: BRANCH_ID,
  name: `Sucursal ${department}`,
  municipality: department,
  department,
  latitude: 14.8,
  longitude: -91.5,
});

function api(answer = () => Response.json(rental({ channel: 'COUNTER' }), { status: 201 })) {
  const sent: unknown[] = [];
  const searches: (string | null)[] = [];
  mockApi({
    'GET /api/administracion/branches/locations': () =>
      Response.json({
        items: [place('Sololá'), place('Quetzaltenango'), place('Quetzaltenango')],
        total: 3,
        page: 1,
        pageSize: 100,
      }),
    'GET /api/clientes/clients': (_init, url) => {
      searches.push(url.searchParams.get('q'));
      return Response.json({ items: [ANA], total: 1, page: 1, pageSize: 100 });
    },
    'GET /api/clientes/rentals/estimate': (_init, url) =>
      Response.json({
        ratePerKm: 30,
        estimatedPrice: Number(url.searchParams.get('distanceKm')) * 30,
        effectiveFrom: '2026-10-01',
      }),
    'POST /api/clientes/branch-rentals': (init) => {
      sent.push(JSON.parse(String(init.body)));
      return answer();
    },
  });
  return Object.assign(sent, { searches });
}

beforeEach(() => {
  push.mockReset();
  jest.mocked(useOwnBranch).mockReturnValue({ id: BRANCH_ID, name: 'Xela Centro' } as never);
  act(() =>
    setSession({
      accessToken: 'a',
      accessExpiresIn: 900,
      user: {
        id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
        fullName: 'Marta Ruiz',
        email: 'm@b.com',
        role: 'BRANCH_ADMIN',
        branchId: BRANCH_ID,
      },
    }),
  );
});
afterEach(() => {
  act(() => clearSession());
  jest.restoreAllMocks();
});

async function choose(user: ReturnType<typeof userEvent.setup>, label: string, option: string) {
  await user.click(screen.getByRole('combobox', { name: label }));
  await user.click(await screen.findByRole('option', { name: option }));
}

async function fillTrip() {
  const user = userEvent.setup({ pointerEventsCheck: 0 });
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Salen de' })).toBeEnabled());
  await choose(user, 'Salen de', 'Quetzaltenango');
  await choose(user, 'Van a', 'Sololá');
  await user.clear(screen.getByLabelText('Día de salida'));
  await user.type(screen.getByLabelText('Día de salida'), '2030-10-24');
  await user.type(screen.getByLabelText('Pasajeros'), '35');
  await user.type(screen.getByLabelText('Distancia aproximada (km)'), '92');
  await screen.findByRole('searchbox', { name: 'Buscar cliente' });
  return user;
}

const ANA_LABEL = 'Ana Méndez · ana@correo.com · NIT 4521837-6';

describe('CounterRentalScreen', () => {
  it('offers only the departments that have a branch, once each', async () => {
    api();
    render(<CounterRentalScreen today="2026-10-21" />, { wrapper: queryWrapper().wrapper });
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Van a' })).toBeEnabled());
    await user.click(screen.getByRole('combobox', { name: 'Van a' }));

    expect((await screen.findAllByRole('option')).map((option) => option.textContent)).toEqual([
      'Quetzaltenango',
      'Sololá',
    ]);
  });

  it('records the rental for the chosen client, with the price on the estimate', async () => {
    const sent = api();
    render(<CounterRentalScreen today="2026-10-21" />, { wrapper: queryWrapper().wrapper });
    const user = await fillTrip();

    await choose(user, 'Cliente', ANA_LABEL);
    await waitFor(() => expect(screen.getByLabelText('Precio acordado')).toHaveValue('2760'));
    await user.click(screen.getByRole('button', { name: 'Registrar alquiler' }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({
      branchId: BRANCH_ID,
      clientId: CLIENT_ID,
      originLabel: 'Quetzaltenango',
      destinationLabel: 'Sololá',
      price: 2760,
      distanceKm: 92,
    });
    expect(push).toHaveBeenCalledWith('/sucursal/alquileres?estado=esperando-pago');
  });

  it('shows the email and NIT of the chosen client, which the select may cut', async () => {
    api();
    render(<CounterRentalScreen today="2026-10-21" />, { wrapper: queryWrapper().wrapper });
    const user = await fillTrip();

    await choose(user, 'Cliente', ANA_LABEL);

    expect(screen.getByText('ana@correo.com · NIT 4521837-6')).toBeInTheDocument();
  });

  it('speaks to the branch admin about the distance and the price', async () => {
    api();
    render(<CounterRentalScreen today="2026-10-21" />, { wrapper: queryWrapper().wrapper });
    await fillTrip();

    expect(await screen.findByText(/Q\s?30\.00 por km/)).toBeInTheDocument();
    expect(screen.queryByText(/La sucursal lo confirma/)).not.toBeInTheDocument();
    expect(screen.queryByText(/La sucursal la revisa contigo/)).not.toBeInTheDocument();
  });

  it('asks the server for the clients that match what is typed', async () => {
    const sent = api();
    render(<CounterRentalScreen today="2026-10-21" />, { wrapper: queryWrapper().wrapper });
    const user = await fillTrip();

    await user.type(screen.getByRole('searchbox', { name: 'Buscar cliente' }), 'Méndez');

    await waitFor(() => expect(sent.searches).toContain('Méndez'));
  });

  it('asks for the client and keeps the price the admin wrote', async () => {
    const sent = api();
    render(<CounterRentalScreen today="2026-10-21" />, { wrapper: queryWrapper().wrapper });
    const user = await fillTrip();

    await user.clear(screen.getByLabelText('Precio acordado'));
    await user.type(screen.getByLabelText('Precio acordado'), '2500');
    await user.click(screen.getByRole('button', { name: 'Registrar alquiler' }));

    expect(screen.getByText('Elige al cliente que alquila.')).toBeInTheDocument();
    expect(screen.getByLabelText('Precio acordado')).toHaveValue('2500');
    expect(sent).toHaveLength(0);
  });

  it('says so when the departments or the clients cannot be loaded', async () => {
    mockApi({
      'GET /api/administracion/branches/locations': () => new Response(null, { status: 500 }),
      'GET /api/clientes/clients': () => new Response(null, { status: 500 }),
    });
    render(<CounterRentalScreen today="2026-10-21" />, { wrapper: queryWrapper().wrapper });

    expect(await screen.findByText('No pudimos cargar los departamentos.')).toBeInTheDocument();
    expect(await screen.findByText('No pudimos cargar los clientes.')).toBeInTheDocument();
  });

  it('shows what the service answers', async () => {
    api(() =>
      Response.json(
        {
          statusCode: 403,
          error: 'Error',
          message: 'Solo puedes registrar alquileres de tu sucursal.',
        },
        { status: 403 },
      ),
    );
    render(<CounterRentalScreen today="2026-10-21" />, { wrapper: queryWrapper().wrapper });
    const user = await fillTrip();

    await choose(user, 'Cliente', ANA_LABEL);
    await user.clear(screen.getByLabelText('Precio acordado'));
    await user.type(screen.getByLabelText('Precio acordado'), '2500');
    await user.click(screen.getByRole('button', { name: 'Registrar alquiler' }));

    expect(
      await screen.findByText('Solo puedes registrar alquileres de tu sucursal.'),
    ).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
