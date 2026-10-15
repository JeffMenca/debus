import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiError, mockClientesApi, movement, movementPage } from '../../test-support/account';
import { queryWrapper } from '../../test-support/query-wrapper';
import type { MovementsQuery } from '@/lib/wallet/wallet-api';
import { MovementsList } from './movements-list';

afterEach(() => jest.restoreAllMocks());

const query: MovementsQuery = { kind: 'all', page: 1, pageSize: 20 };
const renderList = (onChange = jest.fn(), over: Partial<MovementsQuery> = {}) => {
  render(<MovementsList query={{ ...query, ...over }} onChange={onChange} />, {
    wrapper: queryWrapper().wrapper,
  });
  return onChange;
};

describe('MovementsList', () => {
  it('lists each movement with its sign, day and resulting text', async () => {
    mockClientesApi({
      'GET /wallet/movements': () =>
        Response.json(
          movementPage([
            movement({
              id: '1b2c3d4e-5f60-4a71-8b82-93a4b5c6d7e8',
              kind: 'TICKET',
              amount: -170,
              description: 'Boleto Quetzaltenango - Guatemala',
              occurredOn: '2026-10-05',
            }),
            movement({ amount: 300, occurredOn: '2026-10-05' }),
          ]),
        ),
    });
    renderList();

    expect(await screen.findByText('Boleto Quetzaltenango - Guatemala')).toBeInTheDocument();
    expect(screen.getByText('Recarga de saldo')).toBeInTheDocument();
    expect(screen.getByText(/^− Q\s?170\.00$/)).toBeInTheDocument();
    expect(screen.getByText(/^\+ Q\s?300\.00$/)).toBeInTheDocument();
    expect(screen.getAllByText('5 de octubre de 2026')).toHaveLength(2);
  });

  it('asks the server for the chosen kind and page', async () => {
    const fetchMock = mockClientesApi({
      'GET /wallet/movements': () =>
        Response.json(movementPage([movement()], { total: 45, page: 2 })),
    });
    const onChange = renderList(jest.fn(), { kind: 'TOP_UP', page: 2 });

    await screen.findByText('Recarga de saldo');
    expect(String(fetchMock.mock.calls[0]![0])).toContain('kind=TOP_UP&page=2&pageSize=20');
    await userEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));
    expect(onChange).toHaveBeenCalledWith({ page: 3 });
    await userEvent.click(screen.getByRole('tab', { name: 'Boletos' }));
    expect(onChange).toHaveBeenCalledWith({ kind: 'TICKET' });
  });

  it('moves to the first, previous and last pages', async () => {
    mockClientesApi({
      'GET /wallet/movements': () =>
        Response.json(movementPage([movement()], { total: 100, page: 3 })),
    });
    const onChange = renderList(jest.fn(), { page: 3 });

    await screen.findByText('Recarga de saldo');
    await userEvent.click(screen.getByRole('button', { name: 'Primera página' }));
    await userEvent.click(screen.getByRole('button', { name: 'Página anterior' }));
    await userEvent.click(screen.getByRole('button', { name: 'Última página' }));

    expect(onChange.mock.calls).toEqual([[{ page: 1 }], [{ page: 2 }], [{ page: 5 }]]);
  });

  it('lands on the last page when the address asks for one past the end', async () => {
    mockClientesApi({
      'GET /wallet/movements': () => Response.json(movementPage([], { total: 45, page: 9 })),
    });
    const onChange = renderList(jest.fn(), { page: 9 });

    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ page: 3 }));
  });

  it('explains an empty wallet history', async () => {
    mockClientesApi({ 'GET /wallet/movements': () => Response.json(movementPage([])) });
    renderList();

    expect(await screen.findByText(/Todavía no tienes movimientos/)).toBeInTheDocument();
  });

  it('shows the problem and lets the person retry', async () => {
    mockClientesApi({
      'GET /wallet/movements': () => apiError(503, 'El servicio no respondió.'),
    });
    renderList();

    expect(await screen.findByText('El servicio no respondió.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});
