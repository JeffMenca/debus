import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { queryWrapper } from '../../test-support/query-wrapper';
import { BRANCH_ID, mockApi, rental } from '../../test-support/rentals';
import { RentalRequestCard } from './rental-request-card';

jest.mock('sonner', () => ({ toast: { success: jest.fn() } }));
const { toast } = jest.requireMock<{ toast: { success: jest.Mock } }>('sonner');

const TODAY = '2026-10-21';
const locations = {
  items: [
    {
      id: BRANCH_ID,
      name: 'Xela Centro',
      municipality: 'Quetzaltenango',
      department: 'Quetzaltenango',
      latitude: 14.8,
      longitude: -91.5,
    },
  ],
  total: 1,
  page: 1,
  pageSize: 100,
};

function api(
  answer: () => Response = () => Response.json(rental({ status: 'REQUESTED' }), { status: 201 }),
) {
  const sent: unknown[] = [];
  mockApi({
    'GET /api/administracion/branches/locations': () => Response.json(locations),
    'GET /api/clientes/rentals/estimate': (_init, url) =>
      Response.json({
        ratePerKm: 30,
        estimatedPrice: Number(url.searchParams.get('distanceKm')) * 30,
        effectiveFrom: '2026-10-01',
      }),
    'POST /api/clientes/rentals': (init) => {
      sent.push(JSON.parse(String(init.body)));
      return answer();
    },
  });
  return sent;
}

afterEach(() => jest.restoreAllMocks());

async function fill() {
  const user = userEvent.setup();
  await user.click(screen.getByLabelText('Sucursal que te atiende'));
  await user.click(await screen.findByRole('option', { name: /Xela Centro/ }));
  await user.type(screen.getByLabelText('Salen de'), 'Quetzaltenango');
  await user.type(screen.getByLabelText('Van a'), 'Panajachel');
  await user.clear(screen.getByLabelText('Día de salida'));
  await user.type(screen.getByLabelText('Día de salida'), '2030-10-24');
  await user.type(screen.getByLabelText('Pasajeros'), '35');
  await user.type(screen.getByLabelText('Distancia aproximada (km)'), '92');
  return user;
}

describe('RentalRequestCard', () => {
  it('shows the estimate of the distance and asks for the rental', async () => {
    const sent = api();
    render(<RentalRequestCard today={TODAY} />, { wrapper: queryWrapper().wrapper });

    const user = await fill();
    expect(await screen.findByText(/Q\s?2,760\.00/)).toBeInTheDocument();
    expect(screen.getByText(/Q\s?30\.00 por km/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Pedir cotización' }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({
      branchId: BRANCH_ID,
      originLabel: 'Quetzaltenango',
      destinationLabel: 'Panajachel',
      departureAt: '2030-10-24T13:00:00.000Z',
      returnAt: null,
      passengers: 35,
      distanceKm: 92,
    });
    expect(toast.success).toHaveBeenCalledWith(
      'Recibimos tu solicitud. Te avisaremos por correo cuando la sucursal confirme el precio.',
    );
    expect(screen.getByLabelText('Salen de')).toHaveValue('');
  });

  it('asks for the return of a round trip', async () => {
    const sent = api();
    render(<RentalRequestCard today={TODAY} />, { wrapper: queryWrapper().wrapper });
    const user = await fill();

    await user.click(screen.getByLabelText(/Es ida y vuelta/));
    await user.type(screen.getByLabelText('Hora de regreso'), '17:00');
    await user.clear(screen.getByLabelText('Día de regreso'));
    await user.type(screen.getByLabelText('Día de regreso'), '2030-10-24');
    await user.click(screen.getByRole('button', { name: 'Pedir cotización' }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({ returnAt: '2030-10-24T23:00:00.000Z' });
  });

  it('says what is missing before sending anything', async () => {
    const sent = api();
    render(<RentalRequestCard today={TODAY} />, { wrapper: queryWrapper().wrapper });

    await userEvent.click(screen.getByRole('button', { name: 'Pedir cotización' }));

    expect(screen.getByText('Elige la sucursal que te atenderá.')).toBeInTheDocument();
    expect(screen.getByText('Escribe de dónde salen.')).toBeInTheDocument();
    expect(screen.getByText('Escribe la distancia para ver cuánto costaría.')).toBeInTheDocument();
    expect(sent).toEqual([]);
  });

  it('shows what the service answers when it cannot take the request', async () => {
    api(() =>
      Response.json(
        {
          statusCode: 422,
          error: 'Error',
          message: 'Todavía no hay tarifa de alquiler configurada.',
        },
        { status: 422 },
      ),
    );
    render(<RentalRequestCard today={TODAY} />, { wrapper: queryWrapper().wrapper });
    const user = await fill();

    await user.click(screen.getByRole('button', { name: 'Pedir cotización' }));

    expect(
      await screen.findByText('Todavía no hay tarifa de alquiler configurada.'),
    ).toBeInTheDocument();
  });
});
