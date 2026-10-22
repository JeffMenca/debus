import { render, screen } from '@testing-library/react';
import { queryWrapper } from '../../test-support/query-wrapper';
import { mockApi } from '../../test-support/rentals';
import { RentalEstimate } from './rental-estimate';

afterEach(() => jest.restoreAllMocks());

it('tells the client the branch will still price it when the estimate fails', async () => {
  mockApi({
    'GET /api/clientes/rentals/estimate': () =>
      Response.json({ statusCode: 422, error: 'Error', message: 'sin tarifa' }, { status: 422 }),
  });
  render(<RentalEstimate distance="92" />, { wrapper: queryWrapper().wrapper });

  expect(
    await screen.findByText(/No pudimos calcular el precio ahora/, undefined, { timeout: 3000 }),
  ).toBeInTheDocument();
});
