import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { wallet } from '../../test-support/account';
import { queryWrapper } from '../../test-support/query-wrapper';
import { RENTAL_ID, mockApi, rental, rentalPage } from '../../test-support/rentals';
import { RentalHistory } from './rental-history';

jest.mock('sonner', () => ({ toast: { success: jest.fn() } }));
const { toast } = jest.requireMock<{ toast: { success: jest.Mock } }>('sonner');

const query = { page: 1, pageSize: 20 };
const requested = rental({
  id: 'a1b2c3d4-0000-4000-8000-000000000001',
  status: 'REQUESTED',
  price: null,
});
const counter = rental({
  id: 'a1b2c3d4-0000-4000-8000-000000000002',
  channel: 'COUNTER',
  clientId: null,
  status: 'PAID',
  paidOn: '2026-10-20',
  paidAt: '2026-10-20T15:00:00.000Z',
});

function api({ items = [rental(), requested, counter], balance = 3000 } = {}) {
  const sent: { route: string; key?: string; body?: unknown }[] = [];
  const record = (route: string) => (init: RequestInit) => {
    const headers = (init.headers ?? {}) as Record<string, string>;
    sent.push({
      route,
      key: headers['idempotency-key'],
      body: init.body ? JSON.parse(String(init.body)) : undefined,
    });
    return Response.json(rental({ status: 'PAID', paidOn: '2026-10-21' }), { status: 201 });
  };
  mockApi({
    'GET /api/clientes/rentals/mine': () => Response.json(rentalPage(items)),
    'GET /api/clientes/wallet': () => Response.json(wallet({ balance })),
    [`POST /api/clientes/rentals/${RENTAL_ID}/pay`]: record('pay'),
    [`POST /api/clientes/rentals/${requested.id}/cancel`]: record('cancel'),
  });
  return sent;
}

const loadedRows = async () => {
  await screen.findByText('Esperando precio');
  return screen.getAllByRole('row');
};

const renderHistory = () =>
  render(<RentalHistory query={query} onChange={jest.fn()} />, {
    wrapper: queryWrapper().wrapper,
  });

afterEach(() => jest.restoreAllMocks());

describe('RentalHistory', () => {
  it('lists the rentals with their state, and counter ones as such', async () => {
    api();
    renderHistory();

    const rows = await loadedRows();
    expect(rows).toHaveLength(4);
    expect(within(rows[1]!).getByText('Precio listo, falta pagar')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('Esperando precio')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('estimado')).toBeInTheDocument();
    expect(within(rows[3]!).getByText('En ventanilla')).toBeInTheDocument();
    expect(within(rows[3]!).queryByRole('button')).not.toBeInTheDocument();
    expect(within(rows[2]!).queryByRole('button', { name: 'Pagar' })).not.toBeInTheDocument();
  });

  it('lets the client pay and cancel a rental recorded for them at the counter', async () => {
    api({ items: [rental({ channel: 'COUNTER' })] });
    renderHistory();

    expect(await screen.findByRole('button', { name: 'Pagar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
    expect(screen.getByText('En ventanilla')).toBeInTheDocument();
  });

  it('pays a confirmed rental from the wallet with the chosen day and its id as key', async () => {
    const sent = api();
    renderHistory();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Pagar' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText(/Tu saldo: Q\s?3,000\.00/)).toBeInTheDocument();
    await user.clear(within(dialog).getByLabelText('Fecha de pago'));
    await user.type(within(dialog).getByLabelText('Fecha de pago'), '2026-10-20');
    await user.click(within(dialog).getByRole('button', { name: 'Pagar con mi cartera' }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({ route: 'pay', key: RENTAL_ID, body: { paidOn: '2026-10-20' } });
    expect(toast.success).toHaveBeenCalled();
  });

  it('says when the balance does not cover the rental', async () => {
    api({ balance: 100 });
    renderHistory();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Pagar' }));

    expect(await screen.findByText(/Tu saldo no alcanza/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pagar con mi cartera' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Ahora no' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('cancels a rental that is not paid', async () => {
    const sent = api();
    renderHistory();
    const user = userEvent.setup();
    const rows = await loadedRows();

    await user.click(within(rows[2]!).getByRole('button', { name: 'Cancelar' }));
    await user.click(await screen.findByRole('button', { name: 'Sí, cancelar' }));

    await waitFor(() => expect(sent.map((s) => s.route)).toEqual(['cancel']));
    expect(toast.success).toHaveBeenCalledWith('Cancelamos tu alquiler.');
  });

  it('invites to ask for a quote when there is nothing yet', async () => {
    api({ items: [] });
    renderHistory();

    expect(await screen.findByText(/Todavía no has alquilado un bus/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pide tu cotización' })).toHaveAttribute(
      'href',
      '/alquiler',
    );
  });
});
