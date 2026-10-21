import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiError } from '../../test-support/account';
import { queryWrapper } from '../../test-support/query-wrapper';
import { mockVentasApi, soldTicket, ticketPage } from '../../test-support/tickets';
import { TicketHistory } from './ticket-history';

afterEach(() => jest.restoreAllMocks());

const ONLINE = soldTicket({
  id: '0f3a21c4-8b0a-4f8e-9d6c-5b4a3f2e4d1c',
  channel: 'ONLINE',
  originLabel: 'Ciudad de Guatemala',
  destinationLabel: 'Quetzaltenango',
  seats: [22],
  total: 80,
});
const COUNTER = soldTicket({ id: '0a7f13c4-8b0a-4f8e-9d6c-5b4a3f2e4d1c', seats: [17], total: 85 });
const PENDING = soldTicket({
  id: '0e91c7c4-8b0a-4f8e-9d6c-5b4a3f2e4d1c',
  status: 'PENDING',
  channel: 'ONLINE',
});

const renderHistory = (onChange = jest.fn(), page = 1) => {
  render(<TicketHistory query={{ page, pageSize: 20 }} onChange={onChange} />, {
    wrapper: queryWrapper().wrapper,
  });
  return onChange;
};

describe('TicketHistory', () => {
  it('lists the tickets bought online and at the counter, and the pending one', async () => {
    mockVentasApi({ 'GET /tickets': () => Response.json(ticketPage([ONLINE, COUNTER, PENDING])) });
    renderHistory();

    const list = await screen.findByRole('list', { name: 'Tus boletos' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(within(rows[0]!).getByText('Ciudad de Guatemala a Quetzaltenango')).toBeVisible();
    expect(within(rows[0]!).getByText('Compra en línea')).toBeVisible();
    expect(within(rows[0]!).getByText('BOL-0F3A21')).toBeVisible();
    expect(within(rows[0]!).getByText(/asientos 22/)).toBeVisible();
    expect(within(rows[0]!).getByText(/Q\s?80\.00/)).toBeVisible();
    expect(within(rows[1]!).getByText('Comprado en ventanilla')).toBeVisible();
    expect(within(rows[2]!).getByText('Pago en confirmación')).toBeVisible();
  });

  it('puts the next trip on top', async () => {
    const next = soldTicket({ channel: 'ONLINE', seats: [9, 10], total: 170 });
    mockVentasApi({ 'GET /tickets': () => Response.json(ticketPage([ONLINE], next)) });
    renderHistory();

    const card = await screen.findByRole('region', { name: /Próximo viaje/ });
    expect(within(card).getByText('05:30')).toBeVisible();
    expect(within(card).getByText('Quetzaltenango')).toBeVisible();
    expect(within(card).getByText('09, 10')).toBeVisible();
    expect(within(card).getByText('C-482BTX')).toBeVisible();
    expect(within(card).getByText('BOL-8E7D6C')).toBeVisible();
    expect(within(card).getByText(/Q\s?170\.00/)).toBeVisible();
  });

  it('says when the next trip is still waiting for its payment', async () => {
    mockVentasApi({ 'GET /tickets': () => Response.json(ticketPage([PENDING], PENDING)) });
    renderHistory();

    const card = await screen.findByRole('region', { name: /Próximo viaje/ });
    expect(within(card).getByText('Pago en confirmación')).toBeVisible();
  });

  it('pages on the server', async () => {
    const fetchMock = mockVentasApi({
      'GET /tickets': () => Response.json(ticketPage([ONLINE], null, { total: 45, page: 2 })),
    });
    const onChange = renderHistory(jest.fn(), 2);

    await screen.findByText('Ciudad de Guatemala a Quetzaltenango');
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/tickets?page=2&pageSize=20');
    await userEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));
    expect(onChange).toHaveBeenCalledWith({ page: 3 });
  });

  it('lands on the last page when the address asks for one past the end', async () => {
    mockVentasApi({
      'GET /tickets': () => Response.json(ticketPage([], null, { total: 45, page: 9 })),
    });
    const onChange = renderHistory(jest.fn(), 9);

    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ page: 3 }));
  });

  it('invites to look for a trip when there are no tickets yet', async () => {
    mockVentasApi({ 'GET /tickets': () => Response.json(ticketPage([])) });
    renderHistory();

    expect(await screen.findByText(/Todavía no tienes boletos/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Buscar viajes' })).toHaveAttribute('href', '/viajes');
  });

  it('shows the problem and lets the person retry', async () => {
    mockVentasApi({ 'GET /tickets': () => apiError(503, 'El servicio no respondió.') });
    renderHistory();

    expect(await screen.findByText('El servicio no respondió.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeVisible();
  });
});
