import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiError, wallet } from '../../test-support/account';
import { queryWrapper } from '../../test-support/query-wrapper';
import { TRIP_ID, mockGatewayApi, purchase, seatMap } from '../../test-support/tickets';
import { PURCHASE_POLL_MS, PURCHASE_WAIT_MS } from '@/lib/tickets/purchase';
import { PurchaseScreen } from './purchase-screen';

let search = '';
jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(search),
}));

const TODAY = '2026-10-20';
type Answer = () => Response | Promise<Response>;

function mockApi({
  buy = () => Response.json(purchase('CONFIRMED'), { status: 201 }),
  follow = () => Response.json(purchase('CONFIRMED')),
  maps = [seatMap()],
  balance = 340,
}: { buy?: Answer; follow?: Answer; maps?: ReturnType<typeof seatMap>[]; balance?: number } = {}) {
  const keys: string[] = [];
  let mapCalls = 0;
  const fetchMock = mockGatewayApi({
    [`GET /ventas/trips/${TRIP_ID}/seats`]: () =>
      Response.json(maps[Math.min(mapCalls++, maps.length - 1)]),
    'GET /clientes/wallet': () => Response.json(wallet({ balance })),
    'POST /ventas/purchases': (init) => {
      keys.push((init.headers as Record<string, string>)['idempotency-key']!);
      return buy();
    },
    [`GET /ventas/purchases/${purchase().ticketId}`]: follow,
  });
  return { fetchMock, keys, mapCalls: () => mapCalls };
}

const renderScreen = (tripId = TRIP_ID) =>
  render(<PurchaseScreen tripId={tripId} today={TODAY} />, { wrapper: queryWrapper().wrapper });

async function chooseAndPay(user = userEvent.setup()) {
  await user.click(await screen.findByRole('button', { name: 'Asiento 9' }));
  await user.click(screen.getByRole('button', { name: 'Asiento 10' }));
  await user.click(screen.getByRole('button', { name: /^Pagar/ }));
}

beforeEach(() => {
  search = '';
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('PurchaseScreen', () => {
  it('never asks for an address that is not a trip', () => {
    const { fetchMock } = mockApi();
    renderScreen('nope');

    expect(screen.getByRole('heading', { name: 'No encontramos ese viaje' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Volver a viajes' })).toHaveAttribute(
      'href',
      '/viajes',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows the trip, the seats and what the payment leaves in the wallet', async () => {
    search = 'origen=Quetzaltenango&pasajeros=2';
    mockApi();
    renderScreen();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Elige tus asientos' }),
    ).toBeVisible();
    expect(screen.getByText('C-482BTX · 12 asientos · 2 pasajeros')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Volver a viajes' })).toHaveAttribute(
      'href',
      '/viajes?origen=Quetzaltenango&pasajeros=2',
    );
    expect(screen.getByRole('list', { name: 'Pasos de la compra' })).toBeVisible();
    await userEvent.click(await screen.findByRole('button', { name: 'Asiento 9' }));
    await userEvent.click(screen.getByRole('button', { name: 'Asiento 10' }));

    expect(screen.getByText(/^2 asientos × Q\s?85\.00$/)).toBeVisible();
    expect(await screen.findByText(/Q\s?340\.00/)).toBeVisible();
    expect(screen.getAllByText(/Q\s?170\.00/).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /^Pagar Q\s?170\.00$/ })).toBeEnabled();
    expect(screen.getByLabelText('Fecha de pago')).toHaveValue(TODAY);
  });

  it('warns that the balance is short but lets the server answer', async () => {
    mockApi({ balance: 50 });
    renderScreen();
    await userEvent.click(await screen.findByRole('button', { name: 'Asiento 9' }));

    expect(await screen.findByText('Tu saldo no alcanza. Recarga en Mi cuenta.')).toBeVisible();
    expect(screen.getByRole('button', { name: /^Pagar/ })).toBeEnabled();
  });

  it('pays with the wallet and shows the ticket', async () => {
    const { keys } = mockApi();
    renderScreen();

    await chooseAndPay();

    expect(
      await screen.findByRole('heading', { name: '¡Listo! Tu boleto está pagado' }),
    ).toBeVisible();
    expect(screen.getByText('BOL-8E7D6C')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Ver mis boletos' })).toHaveAttribute(
      'href',
      '/cuenta',
    );
    expect(screen.getByRole('link', { name: 'Buscar otro viaje' })).toHaveAttribute(
      'href',
      '/viajes',
    );
    expect(keys).toHaveLength(1);
  });

  it('waits while the payment is confirmed and then shows the ticket', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    mockApi({ buy: () => Response.json(purchase('PENDING'), { status: 202 }) });
    renderScreen();

    await chooseAndPay(user);

    expect(await screen.findByText('Estamos confirmando el pago…')).toBeVisible();
    await act(() => jest.advanceTimersByTimeAsync(PURCHASE_POLL_MS));
    expect(
      await screen.findByRole('heading', { name: '¡Listo! Tu boleto está pagado' }),
    ).toBeVisible();
  });

  it('explains a payment that failed while it was confirmed and pays again with a new key', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const { keys } = mockApi({
      buy: () => Response.json(purchase('PENDING'), { status: 202 }),
      follow: () => Response.json(purchase('FAILED')),
    });
    renderScreen();

    await chooseAndPay(user);
    await act(() => jest.advanceTimersByTimeAsync(PURCHASE_POLL_MS));

    expect(await screen.findByText('No tienes saldo suficiente.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: /^Pagar/ }));
    await waitFor(() => expect(keys).toHaveLength(2));
    expect(keys[1]).not.toBe(keys[0]);
  });

  it('stops waiting after a while and points to the tickets of the account', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    mockApi({
      buy: () => Response.json(purchase('PENDING'), { status: 202 }),
      follow: () => Response.json(purchase('PENDING')),
    });
    renderScreen();

    await chooseAndPay(user);
    await act(() => jest.advanceTimersByTimeAsync(PURCHASE_WAIT_MS));

    expect(
      await screen.findByText('Seguimos confirmando tu pago. Lo verás en Mis boletos.'),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Ir a Mis boletos' })).toHaveAttribute(
      'href',
      '/cuenta',
    );
  });

  it('reloads the map when a seat was sold in the meantime and drops it from the choice', async () => {
    const { mapCalls } = mockApi({
      buy: () => apiError(409, 'Alguno de los asientos que elegiste ya fue vendido. Elige otros.'),
      maps: [seatMap(), seatMap({ taken: [1, 2, 9] })],
    });
    renderScreen();

    await chooseAndPay();

    expect(
      await screen.findByText('Alguno de los asientos que elegiste ya fue vendido. Elige otros.'),
    ).toBeVisible();
    await waitFor(() => expect(mapCalls()).toBe(2));
    expect(await screen.findByRole('button', { name: 'Asiento 9, ocupado' })).toBeDisabled();
    expect(screen.getByText('1 asiento')).toBeVisible();
  });

  it('shows the words of the server for a short balance and for a payment that could not be made', async () => {
    mockApi({
      buy: () => apiError(422, 'No tienes saldo suficiente. Recarga e intenta de nuevo.'),
    });
    renderScreen();
    await chooseAndPay();
    expect(
      await screen.findByText('No tienes saldo suficiente. Recarga e intenta de nuevo.'),
    ).toBeVisible();
  });

  it('charges nothing and keeps the map when the wallet does not answer', async () => {
    const { mapCalls } = mockApi({
      buy: () => apiError(503, 'No pudimos cobrar en este momento; no se hizo ningún cobro.'),
    });
    renderScreen();

    await chooseAndPay();

    expect(
      await screen.findByText('No pudimos cobrar en este momento; no se hizo ningún cobro.'),
    ).toBeVisible();
    expect(mapCalls()).toBe(1);
  });

  it('retries with the same key when the answer never arrived, and a new one after any change', async () => {
    let attempt = 0;
    const { keys } = mockApi({
      buy: () => {
        attempt += 1;
        if (attempt === 1) throw new TypeError('network');
        return apiError(503, 'Sin cobro.');
      },
    });
    renderScreen();

    await chooseAndPay();
    expect(
      await screen.findByText('No pudimos conectarnos. Revisa tu conexión e intenta de nuevo.'),
    ).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: /^Pagar/ }));
    await screen.findByText('Sin cobro.');
    fireEvent.change(screen.getByLabelText('Fecha de pago'), { target: { value: '2026-10-19' } });
    await userEvent.click(screen.getByRole('button', { name: /^Pagar/ }));

    await waitFor(() => expect(keys).toHaveLength(3));
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[1]);
  });

  it('pays with a new key when the seats change after the answer was lost', async () => {
    let attempt = 0;
    const { keys } = mockApi({
      buy: () => {
        attempt += 1;
        if (attempt === 1) throw new TypeError('network');
        return Response.json(purchase('CONFIRMED'), { status: 201 });
      },
    });
    renderScreen();

    await chooseAndPay();
    await screen.findByText('No pudimos conectarnos. Revisa tu conexión e intenta de nuevo.');
    await userEvent.click(screen.getByRole('button', { name: 'Asiento 11' }));
    await userEvent.click(screen.getByRole('button', { name: /^Pagar/ }));

    await waitFor(() => expect(keys).toHaveLength(2));
    expect(keys[1]).not.toBe(keys[0]);
  });

  it('says when the trip is no longer on sale', async () => {
    mockGatewayApi({
      [`GET /ventas/trips/${TRIP_ID}/seats`]: () =>
        apiError(404, 'No encontramos ese viaje. Puede que ya no esté a la venta.'),
      'GET /clientes/wallet': () => Response.json(wallet()),
    });
    renderScreen();

    expect(
      await screen.findByText('No encontramos ese viaje. Puede que ya no esté a la venta.'),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Volver a viajes' })).toBeVisible();
  });

  it('lets the person retry when the map could not load', async () => {
    mockGatewayApi({
      [`GET /ventas/trips/${TRIP_ID}/seats`]: () => apiError(503, 'El servicio no respondió.'),
      'GET /clientes/wallet': () => Response.json(wallet()),
    });
    renderScreen();

    expect(await screen.findByText('El servicio no respondió.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeVisible();
  });
});
