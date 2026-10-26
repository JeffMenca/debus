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

function api(answer = () => Response.json(rental({ channel: 'COUNTER' }), { status: 201 })) {
  const sent: unknown[] = [];
  mockApi({
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
  return sent;
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

async function fillTrip() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Salen de'), 'Quetzaltenango');
  await user.type(screen.getByLabelText('Van a'), 'Panajachel');
  await user.clear(screen.getByLabelText('Día de salida'));
  await user.type(screen.getByLabelText('Día de salida'), '2030-10-24');
  await user.type(screen.getByLabelText('Pasajeros'), '35');
  await user.type(screen.getByLabelText('Distancia aproximada (km)'), '92');
  await user.type(screen.getByLabelText('Nombre del cliente'), 'Colegio San José');
  return user;
}

describe('CounterRentalScreen', () => {
  it('starts the price on the estimate and records the walk-in rental of the branch', async () => {
    const sent = api();
    render(<CounterRentalScreen today="2026-10-21" />, { wrapper: queryWrapper().wrapper });
    const user = await fillTrip();

    await waitFor(() => expect(screen.getByLabelText('Precio acordado')).toHaveValue('2760'));
    await user.type(screen.getByLabelText(/Correo/), 'reservas@colegio.edu.gt');
    await user.click(screen.getByRole('button', { name: 'Registrar alquiler' }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({
      branchId: BRANCH_ID,
      nit: 'CF',
      clientName: 'Colegio San José',
      email: 'reservas@colegio.edu.gt',
      price: 2760,
      distanceKm: 92,
    });
    expect(push).toHaveBeenCalledWith('/sucursal/alquileres?estado=esperando-pago');
  });

  it('keeps the price the admin wrote and checks the client before sending', async () => {
    const sent = api();
    render(<CounterRentalScreen today="2026-10-21" />, { wrapper: queryWrapper().wrapper });
    const user = await fillTrip();

    await user.type(screen.getByLabelText(/NIT/), '12-A');
    await user.clear(screen.getByLabelText('Precio acordado'));
    await user.type(screen.getByLabelText('Precio acordado'), '2500');
    await user.click(screen.getByRole('button', { name: 'Registrar alquiler' }));

    expect(
      screen.getByText('Escribe un NIT válido o déjalo vacío para consumidor final.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Precio acordado')).toHaveValue('2500');
    expect(sent).toEqual([]);
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

    await user.clear(screen.getByLabelText('Precio acordado'));
    await user.type(screen.getByLabelText('Precio acordado'), '2500');
    await user.click(screen.getByRole('button', { name: 'Registrar alquiler' }));

    expect(
      await screen.findByText('Solo puedes registrar alquileres de tu sucursal.'),
    ).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
