import { renderHook, waitFor } from '@testing-library/react';
import { queryWrapper } from '../../test-support/query-wrapper';
import { soldTicket, ticketPage } from '../../test-support/tickets';
import { useMyTickets } from './my-tickets-api';

afterEach(() => jest.restoreAllMocks());

describe('useMyTickets', () => {
  it('asks the server for one page of the history of the client', async () => {
    const answer = ticketPage([soldTicket()], soldTicket());
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(Response.json(answer));
    const { wrapper } = queryWrapper();
    const { result } = renderHook(() => useMyTickets({ page: 2, pageSize: 50 }), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual(answer));
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/api/ventas/tickets?page=2&pageSize=50',
      expect.anything(),
    );
  });
});
